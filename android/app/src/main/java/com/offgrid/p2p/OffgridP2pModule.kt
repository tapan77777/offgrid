package com.offgrid.p2p

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.wifi.p2p.WifiP2pConfig
import android.net.wifi.p2p.WifiP2pDevice
import android.net.wifi.p2p.WifiP2pInfo
import android.net.wifi.p2p.WifiP2pManager
import android.os.Build
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Classic bridged React Native module that exposes Android Wi-Fi Direct
 * (`WifiP2pManager`) to JavaScript. Phase 3 scope only — see D-063.
 *
 * Event names are shared with the TypeScript side via
 * `specs/NativeOffgridP2p.ts` (`EVENT_*` constants).
 */
class OffgridP2pModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "OffgridP2p"
        private const val TAG = "OffgridP2pModule"

        private const val EVENT_PEERS_CHANGED = "OffgridP2p:peersChanged"
        private const val EVENT_CONNECTION_STATE = "OffgridP2p:connectionStateChanged"
        private const val EVENT_PAYLOAD_RECEIVED = "OffgridP2p:payloadReceived"
    }

    override fun getName(): String = MODULE_NAME

    private var manager: WifiP2pManager? = null
    private var channel: WifiP2pManager.Channel? = null
    private var receiver: WifiP2pBroadcastReceiver? = null
    private var initialized = false

    private var socketWorker: SocketWorker? = null

    // Track the last committed group-owner role + owner address so we can
    // detect a group transition even when the OS coalesces broadcasts (some
    // OEMs skip the intermediate groupFormed=false during sequential handoff,
    // which used to leave a stale SocketWorker attached — see Phase 4B rev 2).
    @Volatile private var currentIsGroupOwner: Boolean? = null
    @Volatile private var currentOwnerAddress: String? = null

    // ---------------------------------------------------------------- lifecycle

    @ReactMethod
    fun initialize(promise: Promise) {
        try {
            if (initialized) {
                promise.resolve(true)
                return
            }
            val mgr = reactContext.getSystemService(Context.WIFI_P2P_SERVICE) as? WifiP2pManager
                ?: run {
                    promise.reject("E_NO_P2P", "WIFI_P2P_SERVICE unavailable on this device")
                    return
                }
            val ch = mgr.initialize(reactContext, Looper.getMainLooper()) {
                Log.w(TAG, "WifiP2pManager channel disconnected")
            }
            manager = mgr
            channel = ch

            val filter = IntentFilter().apply {
                addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION)
                addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION)
                addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION)
                addAction(WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION)
            }
            val rcv = WifiP2pBroadcastReceiver(this)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactContext.registerReceiver(rcv, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @SuppressLint("UnspecifiedRegisterReceiverFlag")
                reactContext.registerReceiver(rcv, filter)
            }
            receiver = rcv
            initialized = true

            // WIFI_P2P_CONNECTION_CHANGED_ACTION is non-sticky since Android 10 (R5).
            // Trigger explicit refreshes so JS sees the current state without waiting
            // for a system broadcast.
            requestConnectionInfo()

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_INIT", e.message, e)
        }
    }

    @ReactMethod
    fun dispose(promise: Promise) {
        try {
            receiver?.let {
                try { reactContext.unregisterReceiver(it) } catch (_: IllegalArgumentException) {}
            }
            receiver = null
            channel = null
            manager = null
            initialized = false
            socketWorker?.shutdown()
            socketWorker = null
            currentIsGroupOwner = null
            currentOwnerAddress = null
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("E_DISPOSE", e.message, e)
        }
    }

    // ---------------------------------------------------------------- discovery

    @ReactMethod
    fun startDiscovery(promise: Promise) {
        val mgr = manager
        val ch = channel
        if (mgr == null || ch == null) {
            promise.reject("E_NOT_INITIALIZED", "initialize() must be called first")
            return
        }
        if (!hasNearbyPermission()) {
            promise.reject(
                "E_PERMISSION",
                "NEARBY_WIFI_DEVICES (API 33+) or ACCESS_FINE_LOCATION (API ≤32) not granted",
            )
            return
        }
        try {
            mgr.discoverPeers(ch, object : WifiP2pManager.ActionListener {
                override fun onSuccess() {
                    promise.resolve(null)
                }
                override fun onFailure(reason: Int) {
                    promise.reject("E_DISCOVERY", "discoverPeers failed: ${describeReason(reason)}")
                }
            })
        } catch (se: SecurityException) {
            promise.reject("E_PERMISSION", se.message, se)
        }
    }

    @ReactMethod
    fun stopDiscovery(promise: Promise) {
        val mgr = manager
        val ch = channel
        if (mgr == null || ch == null) {
            promise.resolve(null)
            return
        }
        try {
            mgr.stopPeerDiscovery(ch, object : WifiP2pManager.ActionListener {
                override fun onSuccess() { promise.resolve(null) }
                override fun onFailure(reason: Int) {
                    // Not an error worth surfacing to JS — often thrown when discovery isn't running.
                    Log.w(TAG, "stopPeerDiscovery failed: ${describeReason(reason)}")
                    promise.resolve(null)
                }
            })
        } catch (se: SecurityException) {
            promise.reject("E_PERMISSION", se.message, se)
        }
    }

    @ReactMethod
    fun connectToPeer(deviceAddress: String, promise: Promise) {
        val mgr = manager
        val ch = channel
        if (mgr == null || ch == null) {
            promise.reject("E_NOT_INITIALIZED", "initialize() must be called first")
            return
        }
        if (!hasNearbyPermission()) {
            promise.reject("E_PERMISSION", "nearby-devices permission missing")
            return
        }
        // Bias the initiating device toward the CLIENT role in the GO election.
        // Under D-069 sequential handoff, whichever device calls connectToPeer is
        // the one that most recently held state that must be handed off — being
        // client means groupOwnerAddress reliably points to the remote peer, and
        // the socket is opened proactively from this side (no accept-wait race
        // that could drop a queued forward via E_NO_SOCKET). See Phase 4B report.
        val config = WifiP2pConfig().apply {
            this.deviceAddress = deviceAddress
            groupOwnerIntent = 0
        }
        try {
            mgr.connect(ch, config, object : WifiP2pManager.ActionListener {
                override fun onSuccess() { promise.resolve(null) }
                override fun onFailure(reason: Int) {
                    promise.reject("E_CONNECT", "connect() failed: ${describeReason(reason)}")
                }
            })
        } catch (se: SecurityException) {
            promise.reject("E_PERMISSION", se.message, se)
        }
    }

    // ---------------------------------------------------------------- payload

    @ReactMethod
    fun sendPayload(base64: String, promise: Promise) {
        val worker = socketWorker
        if (worker == null) {
            promise.reject("E_NO_SOCKET", "No Wi-Fi Direct group connection established")
            return
        }
        try {
            val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
            worker.sendFrame(bytes)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("E_SEND", e.message, e)
        }
    }

    // ---------------------------------------------------------------- receiver callbacks

    fun onWifiP2pStateChanged(enabled: Boolean) {
        Log.i(TAG, "P2P state changed: enabled=$enabled")
        if (!enabled) {
            emitConnectionState(groupFormed = false, isGroupOwner = false, groupOwnerAddress = "")
            socketWorker?.stop()
            socketWorker = null
            currentIsGroupOwner = null
            currentOwnerAddress = null
        }
    }

    fun requestPeers() {
        val mgr = manager ?: return
        val ch = channel ?: return
        if (!hasNearbyPermission()) return
        try {
            mgr.requestPeers(ch) { peers ->
                val array: WritableArray = Arguments.createArray()
                peers.deviceList.forEach { device: WifiP2pDevice ->
                    val entry: WritableMap = Arguments.createMap().apply {
                        putString("deviceAddress", device.deviceAddress ?: "")
                        putString("deviceName", device.deviceName ?: "")
                        putInt("status", device.status)
                    }
                    array.pushMap(entry)
                }
                val payload = Arguments.createMap().apply {
                    putArray("peers", array)
                }
                emit(EVENT_PEERS_CHANGED, payload)
            }
        } catch (se: SecurityException) {
            Log.w(TAG, "requestPeers denied: ${se.message}")
        }
    }

    fun requestConnectionInfo() {
        val mgr = manager ?: return
        val ch = channel ?: return
        mgr.requestConnectionInfo(ch) { info: WifiP2pInfo? ->
            val groupFormed = info?.groupFormed == true
            val isGroupOwner = info?.isGroupOwner == true
            val ownerAddress = info?.groupOwnerAddress?.hostAddress ?: ""
            emitConnectionState(groupFormed, isGroupOwner, ownerAddress)

            if (groupFormed) {
                // Bring up socket transport lazily. Group owner runs the server;
                // the other side connects as client with retry (R6).
                //
                // Recreate the worker whenever the effective role OR the peer
                // address changed since the last group-formed callback — the
                // previous `if (socketWorker == null)` guard left a stale worker
                // attached across sequential handoff on OEMs that skip the
                // intermediate groupFormed=false broadcast (Motorola / iQOO /
                // Redmi have all been seen doing this). See Phase 4B rev 2.
                val roleChanged = currentIsGroupOwner != isGroupOwner
                val ownerChanged = currentOwnerAddress != ownerAddress
                if (socketWorker == null || roleChanged || ownerChanged) {
                    Log.i(
                        TAG,
                        "SocketWorker (re)start: isGO=$isGroupOwner owner=$ownerAddress " +
                            "(roleChanged=$roleChanged ownerChanged=$ownerChanged)",
                    )
                    socketWorker?.stop()
                    socketWorker = SocketWorker(
                        onFrame = { fromAddress, base64 ->
                            val payload = Arguments.createMap().apply {
                                putString("fromAddress", fromAddress)
                                putString("base64", base64)
                            }
                            emit(EVENT_PAYLOAD_RECEIVED, payload)
                        },
                        onError = { message, throwable ->
                            Log.w(TAG, "SocketWorker error: $message", throwable)
                        },
                    ).also { worker ->
                        if (isGroupOwner) {
                            worker.startAsGroupOwner()
                        } else if (ownerAddress.isNotEmpty()) {
                            worker.startAsClient(ownerAddress)
                        }
                    }
                    currentIsGroupOwner = isGroupOwner
                    currentOwnerAddress = ownerAddress
                }
            } else {
                socketWorker?.stop()
                socketWorker = null
                currentIsGroupOwner = null
                currentOwnerAddress = null
            }
        }
    }

    // ---------------------------------------------------------------- helpers

    private fun emitConnectionState(
        groupFormed: Boolean,
        isGroupOwner: Boolean,
        groupOwnerAddress: String,
    ) {
        val payload = Arguments.createMap().apply {
            putBoolean("groupFormed", groupFormed)
            putBoolean("isGroupOwner", isGroupOwner)
            putString("groupOwnerAddress", groupOwnerAddress)
        }
        emit(EVENT_CONNECTION_STATE, payload)
    }

    private fun emit(eventName: String, payload: WritableMap) {
        if (!reactContext.hasActiveReactInstance()) return
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, payload)
    }

    private fun hasNearbyPermission(): Boolean {
        val required = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.NEARBY_WIFI_DEVICES
        } else {
            Manifest.permission.ACCESS_FINE_LOCATION
        }
        return ContextCompat.checkSelfPermission(reactContext, required) == PackageManager.PERMISSION_GRANTED
    }

    private fun describeReason(reason: Int): String = when (reason) {
        WifiP2pManager.P2P_UNSUPPORTED -> "P2P_UNSUPPORTED"
        WifiP2pManager.ERROR -> "ERROR"
        WifiP2pManager.BUSY -> "BUSY"
        else -> "code=$reason"
    }

    // Required by RN to silence NativeEventEmitter warnings on iOS. Harmless on Android.
    @ReactMethod
    fun addListener(eventName: String) { /* no-op */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* no-op */ }
}
