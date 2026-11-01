package app.trainpoker.host

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoWSD
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.Executors

/** Keeps the table server alive while the screen is off. */
class HostService : Service() {
    private var server: TableServer? = null
    private var wake: PowerManager.WakeLock? = null
    private var wifi: WifiManager.WifiLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground()
        if (server == null) {
            wake = (getSystemService(POWER_SERVICE) as PowerManager)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TrainPoker:table").apply { acquire(6 * 60 * 60 * 1000L) }
            @Suppress("DEPRECATION")
            wifi = (applicationContext.getSystemService(WIFI_SERVICE) as WifiManager)
                .createWifiLock(if (Build.VERSION.SDK_INT >= 29) WifiManager.WIFI_MODE_FULL_LOW_LATENCY else WifiManager.WIFI_MODE_FULL_HIGH_PERF, "TrainPoker:table")
                .apply { acquire() }
            server = TableServer(this).also { it.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false) }
            Executors.newSingleThreadExecutor().execute {
                engineCheck = try { JsTable.selfCheck(this) } catch (e: Throwable) { Log.e(TAG, "engine", e); "{\"error\":\"${e.message}\"}" }
            }
        }
        return START_STICKY
    }

    private fun startAsForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Table running", NotificationManager.IMPORTANCE_LOW))
        val n: Notification = Notification.Builder(this, CHANNEL)
            .setContentTitle("Train Poker table is running")
            .setContentText("Guests can join on this phone's hotspot.")
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(1, n)
    }

    override fun onDestroy() {
        server?.stop(); server = null
        wake?.let { if (it.isHeld) it.release() }
        wifi?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    companion object {
        const val TAG = "TrainPokerHost"
        const val CHANNEL = "table"
        const val PORT = 8765
        @Volatile var engineCheck: String = "{\"pending\":true}"
    }
}

/** Serves the game page from the app, plus a WebSocket for the table. Spike: the socket echoes. */
class TableServer(private val service: HostService) : NanoWSD(HostService.PORT) {
    override fun openWebSocket(handshake: IHTTPSession): WebSocket = Echo(handshake)

    override fun serveHttp(session: IHTTPSession): Response {
        val path = session.uri.trimStart('/')
        return when (path) {
            "info" -> json(JSONObject().apply {
                val addrs = TableCode.localAddresses()
                put("addresses", JSONArray(addrs.map { "${it.first} ${it.second}" }))
                put("code", addrs.firstNotNullOfOrNull { TableCode.encode(it.second) } ?: JSONObject.NULL)
                put("engine", JSONObject(HostService.engineCheck))
                put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
                put("android", Build.VERSION.RELEASE)
            })
            else -> asset(if (path.isEmpty()) "index.html" else path)
        }
    }

    private fun json(o: JSONObject): Response =
        newFixedLengthResponse(Response.Status.OK, "application/json", o.toString()).apply { addHeader("Cache-Control", "no-store") }

    private fun asset(path: String): Response {
        if (path.contains("..")) return newFixedLengthResponse(Response.Status.FORBIDDEN, "text/plain", "no")
        return try {
            val bytes = service.assets.open("web/$path").use { it.readBytes() }
            newFixedLengthResponse(Response.Status.OK, mime(path), bytes.inputStream(), bytes.size.toLong())
        } catch (e: IOException) {
            newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found: $path")
        }
    }

    private fun mime(p: String) = when (p.substringAfterLast('.')) {
        "html" -> "text/html; charset=utf-8"; "js", "mjs" -> "text/javascript"; "css" -> "text/css"
        "json", "webmanifest" -> "application/json"; "png" -> "image/png"; "webp" -> "image/webp"
        "woff2" -> "font/woff2"; "svg" -> "image/svg+xml"; else -> "application/octet-stream"
    }

    private class Echo(h: IHTTPSession) : WebSocket(h) {
        override fun onOpen() {}
        override fun onClose(code: WebSocketFrame.CloseCode?, reason: String?, initiatedByRemote: Boolean) {}
        override fun onMessage(message: WebSocketFrame) { send("echo:" + message.textPayload) }
        override fun onPong(pong: WebSocketFrame?) {}
        override fun onException(exception: IOException?) {}
    }
}
