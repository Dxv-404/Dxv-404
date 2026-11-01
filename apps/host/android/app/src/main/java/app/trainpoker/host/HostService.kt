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
            // no read timeout: a phone with its screen off keeps its socket; the table closes silent ones itself
            server = TableServer(this).also { it.boot(); it.start(0, false) }
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
            .setContentText("Friends join on this phone's hotspot. Keep it plugged in for long nights.")
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

/**
 * The table server on the hotspot: the web app's files (guests' phones load the game from here, as the
 * hotspot has no internet), /info for the host's screen, and the table's WebSocket at /table/OFFLINE, all
 * handed to the shared table server script through HostBridge. Same routes as the Node host (node-host.ts).
 */
class TableServer(private val service: HostService) : NanoWSD(HostService.PORT) {
    private val sockets = java.util.concurrent.ConcurrentHashMap<Int, TableSocket>()
    private val nextId = java.util.concurrent.atomic.AtomicInteger(1)
    val bridge = HostBridge(service) { id -> sockets[id] }
    val uploader = Uploader(bridge.outbox)

    fun boot() {
        Log.i(HostService.TAG, "table: " + bridge.start())
        bridge.onLeague = { uploader.kick() }
        uploader.start()
    }

    override fun stop() { super.stop(); uploader.stop(); bridge.stop() }

    override fun openWebSocket(handshake: IHTTPSession): WebSocket = TableSocket(handshake, nextId.getAndIncrement())

    private fun local(s: IHTTPSession): Boolean = s.remoteIpAddress == "127.0.0.1" || s.remoteIpAddress == "::1" || s.remoteIpAddress == "0:0:0:0:0:0:0:1"

    override fun serve(session: IHTTPSession): Response {
        // only the table's own socket path is a WebSocket
        if (isWebsocketRequested(session) && session.uri != "/table/OFFLINE") return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found")
        return super.serve(session)
    }

    override fun serveHttp(session: IHTTPSession): Response {
        val path = session.uri
        if (session.method == Method.OPTIONS) return cors(newFixedLengthResponse(Response.Status.NO_CONTENT, "text/plain", ""))
        return when (path) {
            "/info" -> json(JSONObject().apply {
                val addrs = TableCode.localAddresses()
                put("host", true)
                put("addresses", JSONArray(addrs.map { it.second }))
                put("code", addrs.firstNotNullOfOrNull { TableCode.encode(it.second) } ?: JSONObject.NULL)
                put("table", JSONObject(bridge.stats()))
                put("outbox", uploader.waiting())
                put("upload", uploader.lastResult)
                put("engine", JSONObject(HostService.engineCheck))
                put("model", "${Build.MANUFACTURER} ${Build.MODEL}")
                put("android", Build.VERSION.RELEASE)
            })
            "/continue", "/reset" -> {
                if (session.method != Method.POST || !local(session)) return json(JSONObject().put("error", "Only on the host phone"), Response.Status.FORBIDDEN)
                try {
                    if (path == "/reset") json(JSONObject().put("ok", bridge.reset()))
                    else {
                        val body = HashMap<String, String>()
                        session.parseBody(body)
                        val b = JSONObject(body["postData"] ?: "{}")
                        json(JSONObject().put("ok", bridge.continueFrom(b.getString("checkpoint"), b.getString("player"))))
                    }
                } catch (e: Exception) { json(JSONObject().put("error", e.cause?.message ?: e.message), Response.Status.BAD_REQUEST) }
            }
            else -> asset(path.trimStart('/'))
        }
    }

    private fun cors(r: Response): Response = r.apply {
        addHeader("Access-Control-Allow-Origin", "*"); addHeader("Access-Control-Allow-Headers", "content-type"); addHeader("Access-Control-Allow-Methods", "GET, POST")
    }
    private fun json(o: JSONObject, status: Response.Status = Response.Status.OK): Response =
        cors(newFixedLengthResponse(status, "application/json", o.toString()).apply { addHeader("Cache-Control", "no-store") })

    private fun asset(path0: String): Response {
        if (path0.contains("..")) return newFixedLengthResponse(Response.Status.FORBIDDEN, "text/plain", "no")
        // the app's own routes all load the page; files have an extension
        val path = if (path0.isEmpty() || path0 == "join" || !path0.substringAfterLast('/').contains('.')) "index.html" else path0
        return try {
            val bytes = service.assets.open("web/$path").use { it.readBytes() }
            newFixedLengthResponse(Response.Status.OK, mime(path), bytes.inputStream(), bytes.size.toLong()).apply {
                addHeader("Cache-Control", if (path == "index.html" || path == "sw.js") "no-store" else "max-age=3600")
            }
        } catch (e: IOException) {
            newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found: $path")
        }
    }

    private fun mime(p: String) = when (p.substringAfterLast('.')) {
        "html" -> "text/html; charset=utf-8"; "js", "mjs" -> "text/javascript"; "css" -> "text/css"
        "json", "webmanifest" -> "application/json"; "png" -> "image/png"; "webp" -> "image/webp"
        "woff2" -> "font/woff2"; "svg" -> "image/svg+xml"; "mp3" -> "audio/mpeg"; "map" -> "application/json"; else -> "application/octet-stream"
    }

    inner class TableSocket(h: IHTTPSession, val id: Int) : WebSocket(h), HostBridge.Socket {
        override fun onOpen() { sockets[id] = this; bridge.open(id) }
        override fun onClose(code: WebSocketFrame.CloseCode?, reason: String?, initiatedByRemote: Boolean) {
            if (sockets.remove(id) != null) bridge.closed(id)
        }
        override fun onMessage(message: WebSocketFrame) {
            val t = message.textPayload ?: return
            if (t.length > 8 * 1024) return
            bridge.message(id, t)
        }
        override fun onPong(pong: WebSocketFrame?) {}
        override fun onException(exception: IOException?) { if (sockets.remove(id) != null) bridge.closed(id) }
        override fun send(text: String) { try { super.send(text) } catch (_: IOException) { /* gone: its close comes */ } }
        override fun close(code: Int, reason: String) {
            try { close(WebSocketFrame.CloseCode.find(code) ?: WebSocketFrame.CloseCode.NormalClosure, reason, false) } catch (_: IOException) {}
        }
    }
}
