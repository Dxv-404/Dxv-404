package app.trainpoker.host

import android.content.Context
import android.util.Log
import app.cash.quickjs.QuickJs
import java.io.File
import java.security.SecureRandom
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/** What the table server script calls (see host-runtime.ts, `Native`). */
interface Native {
    fun send(id: Double, text: String)
    fun close(id: Double, code: Double, reason: String)
    fun schedule(at: Double)
    fun save(json: String)
    fun appendHand(json: String)
    fun league(kind: String, id: String, payload: String)
    fun log(message: String)
}

/** What the app calls in the script (the exported functions of host-runtime.ts). */
interface HostApi {
    fun start(saved: String, tuning: String): String
    fun reset(): String
    fun continueFrom(checkpoint: String, host: String): String
    fun open(id: Double)
    fun message(id: Double, text: String)
    fun closed(id: Double)
    fun wake()
    fun stats(): String
}


/**
 * Runs the shared TypeScript table server (bundled to host-runtime.js) inside QuickJS. Every call into the
 * script happens on one thread, one at a time, exactly like the Node host the tests use (node-host.ts).
 */
class HostBridge(private val context: Context, private val sockets: (Int) -> Socket?) {
    interface Socket { fun send(text: String); fun close(code: Int, reason: String) }

    private val js = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "table").apply { isDaemon = true } }
    private lateinit var qjs: QuickJs
    private lateinit var api: HostApi
    private var timer: ScheduledFuture<*>? = null
    private val dir = File(context.filesDir, "table").apply { mkdirs() }
    private val tableFile = File(dir, "table.json")
    val outbox = File(dir, "outbox").apply { mkdirs() }

    private fun write(f: File, text: String) {
        val tmp = File(f.path + ".tmp")
        tmp.writeText(text)
        if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f) }
    }

    private val native = object : Native {
        override fun send(id: Double, text: String) { sockets(id.toInt())?.send(text) }
        override fun close(id: Double, code: Double, reason: String) { sockets(id.toInt())?.close(code.toInt(), reason) }
        override fun schedule(at: Double) {
            timer?.cancel(false)
            timer = if (at < 0) null else js.schedule({ call { api.wake() } }, maxOf(0L, at.toLong() - System.currentTimeMillis()), TimeUnit.MILLISECONDS)
        }
        override fun save(json: String) { if (json.isEmpty()) tableFile.delete() else write(tableFile, json) }
        override fun appendHand(json: String) { File(dir, "hands.jsonl").appendText(json + "\n") }
        override fun league(kind: String, id: String, payload: String) {
            val item = org.json.JSONObject().put("id", id).put("fn", if (kind == "hand") "record_hand" else "record_game_end").put("body", payload)
            write(File(outbox, "%015d-%s.json".format(System.currentTimeMillis(), java.net.URLEncoder.encode(id, "UTF-8"))), item.toString())
            onLeague()
        }
        override fun log(message: String) { Log.i(TAG, message) }
    }
    var onLeague: () -> Unit = {}

    fun start(): String = run {
        val rng = SecureRandom()
        qjs = QuickJs.create()
        qjs.set("nativeRandom", NativeRandom::class.java, object : NativeRandom {
            override fun word(): Double = (rng.nextInt().toLong() and 0xffL).toDouble()
        })
        qjs.evaluate("globalThis.crypto = { getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = nativeRandom.word(); return a; } };", "crypto.js")
        qjs.set("native", Native::class.java, native)
        qjs.evaluate(context.assets.open("host-runtime.js").bufferedReader().use { it.readText() } + ";globalThis.TPHost = TPHost;", "host-runtime.js")
        api = qjs.get("TPHost", HostApi::class.java)
        api.start(if (tableFile.exists()) tableFile.readText() else "", "")
    }

    fun open(id: Int) = post { api.open(id.toDouble()) }
    fun message(id: Int, text: String) = post { api.message(id.toDouble(), text) }
    fun closed(id: Int) = post { api.closed(id.toDouble()) }
    fun stats(): String = run { api.stats() }
    fun reset(): String = run { api.reset() }
    fun continueFrom(checkpoint: String, host: String): String = run { api.continueFrom(checkpoint, host) }

    /** Run on the table thread and wait for the answer. */
    private fun <T> run(fn: () -> T): T = js.submit(java.util.concurrent.Callable { fn() }).get(20, TimeUnit.SECONDS)
    private fun post(fn: () -> Unit) { js.execute { call(fn) } }
    private fun call(fn: () -> Unit) { try { fn() } catch (e: Throwable) { Log.e(TAG, "table", e) } }

    fun stop() {
        timer?.cancel(false)
        js.submit { try { qjs.close() } catch (_: Throwable) {} }
        js.shutdown()
    }

    companion object { const val TAG = "TrainPokerTable" }
}
