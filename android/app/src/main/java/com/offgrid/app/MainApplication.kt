package com.offgrid.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.offgrid.location.OffgridLocationPackage
import com.offgrid.p2p.OffgridP2pPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Phase 3 (D-063): classic bridged Wi-Fi Direct module.
          add(OffgridP2pPackage())
          // GPS/Location Foundation (D-067): classic bridged LocationManager
          // wrapper. Deliberately independent of Google Play Services.
          add(OffgridLocationPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
