package uz.sizlarbilan.deliveryhub

import android.Manifest
import android.content.pm.PackageManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * The shop's map asks for the location ("my location"): the web view needs the app to hold the permission first.
 * `deliveryhub/location` → `request` asks the customer (once; later answers come straight back) and says if it may.
 */
class MainActivity : FlutterActivity() {
    private var waiting: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "deliveryhub/location").setMethodCallHandler { call, result ->
            when {
                call.method != "request" -> result.notImplemented()
                allowed() -> result.success(true)
                else -> {
                    waiting?.success(false)
                    waiting = result
                    requestPermissions(
                        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                        LOCATION_REQUEST,
                    )
                }
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == LOCATION_REQUEST) {
            waiting?.success(allowed())
            waiting = null
        }
    }

    private fun allowed() =
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private companion object {
        const val LOCATION_REQUEST = 7301
    }
}
