package com.offgrid.p2p

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.wifi.p2p.WifiP2pManager

/**
 * Forwards the four Wi-Fi P2P system broadcasts to [OffgridP2pModule].
 *
 * Note (D-063 / R5): as of Android 10, `WIFI_P2P_CONNECTION_CHANGED_ACTION` is
 * no longer sticky. The module must explicitly call `requestConnectionInfo` and
 * `requestDeviceInfo` after registering this receiver — it cannot rely on receiving
 * an initial broadcast at registration time.
 */
internal class WifiP2pBroadcastReceiver(
    private val delegate: OffgridP2pModule,
) : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION -> {
                val state = intent.getIntExtra(
                    WifiP2pManager.EXTRA_WIFI_STATE,
                    WifiP2pManager.WIFI_P2P_STATE_DISABLED,
                )
                delegate.onWifiP2pStateChanged(state == WifiP2pManager.WIFI_P2P_STATE_ENABLED)
            }

            WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION -> {
                delegate.requestPeers()
            }

            WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION -> {
                delegate.requestConnectionInfo()
            }

            WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION -> {
                // No-op for Phase 3; kept subscribed for parity with the intent filter set.
            }
        }
    }
}
