package app.trainpoker.host

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.webkit.WebView

/** The host's own screen: a WebView on the table server running in this phone. */
class MainActivity : Activity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val svc = Intent(this, HostService::class.java)
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(svc) else startService(svc)
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 1)
        WebView.setWebContentsDebuggingEnabled(true)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
        }
        setContentView(web)
        web.postDelayed({ web.loadUrl("http://127.0.0.1:${HostService.PORT}/") }, 600)
    }

    @Deprecated("Back goes back inside the table page, never out of the app by accident.")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else moveTaskToBack(true)
    }
}
