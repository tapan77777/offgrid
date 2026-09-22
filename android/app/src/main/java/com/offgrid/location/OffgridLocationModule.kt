package com.offgrid.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap

/**
 * Classic bridged React Native module that exposes Android
 * `android.location.LocationManager` to JavaScript.
 *
 * Deliberately independent of Google Play Services (see D-067) so OFFGRID
 * remains usable on AOSP / degoogled devices — hikers are exactly the
 * population most likely to be running one.
 *
 * Foreground-only per D-067: this module does NOT hold locks past the
 * pending promise, does NOT register a foreground service, and does NOT
 * support background updates. The V0 milestone is a single-shot
 * "get current location" call driven from a foregrounded screen.
 *
 * No fake fallback. If the GPS provider is disabled, permission is not
 * granted, or the fix does not arrive before the timeout, the promise
 * rejects with an honest error code and JS translates that into a visible
 * user state (CLAUDE.md §14, §20).
 */
class OffgridLocationModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "OffgridLocation"
        private const val TAG = "OffgridLocationModule"

        // 60s is a generous upper bound for a cold GPS fix outdoors; JS
        // callers pass a shorter timeout when the UI is impatient.
        private const val DEFAULT_TIMEOUT_MS = 60_000L
    }

    override fun getName(): String = MODULE_NAME

    private val mainHandler = Handler(Looper.getMainLooper())

    @ReactMethod
    fun checkPermission(promise: Promise) {
        try {
            promise.resolve(buildPermissionStatus())
        } catch (e: Exception) {
            promise.reject("E_PERMISSION_CHECK", e.message, e)
        }
    }

    @ReactMethod
    fun isLocationEnabled(promise: Promise) {
        try {
            val mgr = reactContext.getSystemService(Context.LOCATION_SERVICE)
                as? LocationManager
                ?: return promise.reject(
                    "E_NO_LOCATION_SERVICE",
                    "LOCATION_SERVICE unavailable on this device",
                )
            val enabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                mgr.isLocationEnabled
            } else {
                @Suppress("DEPRECATION")
                mgr.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                    mgr.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            }
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("E_LOCATION_ENABLED", e.message, e)
        }
    }

    /**
     * One-shot location request. Options:
     *  - `timeoutMs` (number, default 60000): reject with E_TIMEOUT if no fix.
     *  - `maxAgeMs` (number, optional): if the cached last-known fix is fresher
     *    than this, return it instead of registering a new listener.
     *
     * Resolves with a WritableMap:
     *   { latitude, longitude, accuracy?, altitude?, heading?, speed?,
     *     provider, timestampMs, wasCached }
     */
    @ReactMethod
    fun getCurrentLocation(options: ReadableMap?, promise: Promise) {
        val timeoutMs = options?.readLong("timeoutMs") ?: DEFAULT_TIMEOUT_MS
        val maxAgeMs = options?.readLong("maxAgeMs")

        if (!hasFineOrCoarsePermission()) {
            promise.reject("E_PERMISSION_DENIED", "Location permission not granted")
            return
        }

        val mgr = reactContext.getSystemService(Context.LOCATION_SERVICE)
            as? LocationManager
            ?: return promise.reject(
                "E_NO_LOCATION_SERVICE",
                "LOCATION_SERVICE unavailable on this device",
            )

        // Fast path: return a fresh-enough cached fix without registering.
        if (maxAgeMs != null) {
            val cached = latestKnownLocation(mgr)
            if (cached != null &&
                System.currentTimeMillis() - cached.time <= maxAgeMs
            ) {
                promise.resolve(toMap(cached, wasCached = true))
                return
            }
        }

        // The listener + timeout share a completion latch so we resolve/reject
        // exactly once regardless of which fires first.
        val completed = java.util.concurrent.atomic.AtomicBoolean(false)
        var listener: LocationListener? = null
        var timeoutRunnable: Runnable? = null

        listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                if (!completed.compareAndSet(false, true)) return
                cleanup(mgr, listener, timeoutRunnable)
                promise.resolve(toMap(location, wasCached = false))
            }

            override fun onProviderDisabled(provider: String) {
                // A single provider disabling is not fatal; wait for another
                // provider or for the timeout. This intentionally does NOT
                // reject early — the fused/network provider may still succeed.
            }

            override fun onProviderEnabled(provider: String) {}

            @Deprecated("Deprecated in API 29+", ReplaceWith(""))
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        }

        timeoutRunnable = Runnable {
            if (!completed.compareAndSet(false, true)) return@Runnable
            cleanup(mgr, listener, null)
            promise.reject("E_TIMEOUT", "No location fix within ${timeoutMs}ms")
        }

        try {
            registerListener(mgr, listener)
        } catch (se: SecurityException) {
            completed.set(true)
            promise.reject("E_PERMISSION_DENIED", se.message, se)
            return
        } catch (e: Exception) {
            completed.set(true)
            promise.reject("E_LOCATION_REQUEST", e.message, e)
            return
        }

        mainHandler.postDelayed(timeoutRunnable, timeoutMs)
    }

    // ---------------------------------------------------------------- helpers

    @SuppressLint("MissingPermission")
    private fun registerListener(mgr: LocationManager, listener: LocationListener) {
        // Prefer GPS; also request NETWORK so we get any fix quickly.
        val providers = mgr.allProviders.filter {
            it == LocationManager.GPS_PROVIDER ||
                it == LocationManager.NETWORK_PROVIDER
        }
        if (providers.isEmpty()) {
            throw IllegalStateException("No usable location provider on this device")
        }
        for (provider in providers) {
            if (!mgr.isProviderEnabled(provider)) continue
            mgr.requestSingleUpdate(provider, listener, Looper.getMainLooper())
        }
    }

    @SuppressLint("MissingPermission")
    private fun latestKnownLocation(mgr: LocationManager): Location? {
        return try {
            val candidates = listOf(
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER,
            ).mapNotNull { p -> mgr.getLastKnownLocation(p) }
            candidates.maxByOrNull { it.time }
        } catch (se: SecurityException) {
            Log.w(TAG, "getLastKnownLocation denied: ${se.message}")
            null
        }
    }

    private fun cleanup(
        mgr: LocationManager,
        listener: LocationListener?,
        timeoutRunnable: Runnable?,
    ) {
        if (listener != null) {
            try { mgr.removeUpdates(listener) } catch (_: Exception) {}
        }
        if (timeoutRunnable != null) {
            mainHandler.removeCallbacks(timeoutRunnable)
        }
    }

    private fun toMap(location: Location, wasCached: Boolean): WritableMap {
        val map = Arguments.createMap()
        map.putDouble("latitude", location.latitude)
        map.putDouble("longitude", location.longitude)
        if (location.hasAccuracy()) {
            map.putDouble("accuracy", location.accuracy.toDouble())
        }
        if (location.hasAltitude()) {
            map.putDouble("altitude", location.altitude)
        }
        if (location.hasBearing()) {
            map.putDouble("heading", location.bearing.toDouble())
        }
        if (location.hasSpeed()) {
            map.putDouble("speed", location.speed.toDouble())
        }
        map.putString("provider", location.provider ?: "unknown")
        map.putDouble("timestampMs", location.time.toDouble())
        map.putBoolean("wasCached", wasCached)
        return map
    }

    private fun buildPermissionStatus(): WritableMap {
        val map = Arguments.createMap()
        map.putBoolean("fine", hasPermission(Manifest.permission.ACCESS_FINE_LOCATION))
        map.putBoolean(
            "coarse",
            hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION),
        )
        return map
    }

    private fun hasFineOrCoarsePermission(): Boolean {
        return hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) ||
            hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
    }

    private fun hasPermission(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(reactContext, permission) ==
            PackageManager.PERMISSION_GRANTED
    }
}

private fun ReadableMap.readLong(key: String): Long? {
    if (!hasKey(key) || isNull(key)) return null
    return try {
        getDouble(key).toLong()
    } catch (_: Exception) {
        try { getInt(key).toLong() } catch (_: Exception) { null }
    }
}
