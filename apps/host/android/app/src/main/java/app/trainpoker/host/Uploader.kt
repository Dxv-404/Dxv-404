package app.trainpoker.host

import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Sends the night's records to a table server when this phone has internet again (the server checks every
 * hand and records it for the league; the game then waits for two players to confirm it). Tries the
 * Hyderabad server first, then the Cloudflare one; keeps everything until a server says it has it.
 */
class Uploader(private val outbox: File) {
    private val servers = listOf("https://140-245-200-214.sslip.io", "https://train-poker-tables.apins-subdomain.workers.dev")
    private val pool = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "upload").apply { isDaemon = true } }
    @Volatile var lastResult: String = "nothing to send"

    fun start() { pool.scheduleWithFixedDelay({ runOnce() }, 5, 30, TimeUnit.SECONDS) }
    fun kick() { pool.execute { runOnce() } }
    fun stop() { pool.shutdownNow() }
    fun waiting(): Int = outbox.listFiles { f -> f.name.endsWith(".json") }?.size ?: 0

    private fun runOnce() {
        try {
            val files = outbox.listFiles { f -> f.name.endsWith(".json") }?.sortedBy { it.name } ?: return
            if (files.isEmpty()) { lastResult = "everything sent"; return }
            for (f in files) {
                val code = post(f.readText())
                when {
                    code == 200 -> f.delete()
                    code == 422 -> f.renameTo(File(f.path + ".refused"))
                    else -> { lastResult = "waiting for internet (${waiting()} to send)"; return }
                }
            }
            lastResult = "everything sent"
        } catch (e: Throwable) { Log.w(HostBridge.TAG, "upload", e) }
    }

    private fun post(body: String): Int {
        for (s in servers) {
            try {
                val c = URL("$s/offline/upload").openConnection() as HttpURLConnection
                c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 8000; c.readTimeout = 15000
                c.setRequestProperty("content-type", "application/json")
                c.outputStream.use { it.write(body.toByteArray()) }
                val code = c.responseCode
                c.disconnect()
                if (code == 200 || code == 422) return code
            } catch (_: Exception) { /* next server */ }
        }
        return -1
    }
}
