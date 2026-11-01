package app.trainpoker.host

import android.content.Context
import app.cash.quickjs.QuickJs
import java.security.SecureRandom

/** Random words for the engine's shuffle, from the phone's secure generator. */
interface NativeRandom { fun word(): Double }

/**
 * Runs the shared TypeScript rules engine (bundled to plain JavaScript) inside QuickJS,
 * so the host phone deals with exactly the same code as the online server.
 */
object JsTable {
    fun selfCheck(context: Context): String {
        val engine = context.assets.open("engine.js").bufferedReader().use { it.readText() }
        val rng = SecureRandom()
        QuickJs.create().use { qjs ->
            qjs.set("nativeRandom", NativeRandom::class.java, object : NativeRandom {
                override fun word(): Double = (rng.nextInt().toLong() and 0xffffffffL).toDouble()
            })
            qjs.evaluate(
                "globalThis.crypto = { getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = nativeRandom.word(); return a; } };",
                "crypto.js",
            )
            qjs.evaluate(engine, "engine.js")
            return qjs.evaluate("JSON.stringify(TPEngineCheck.run(200))", "check.js") as String
        }
    }
}
