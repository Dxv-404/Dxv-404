package app.trainpoker.host

import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * The 5-digit table code is the hotspot address written as a number: the last two parts of
 * 192.168.X.Y become X * 256 + Y. Android 11+ picks a new X.Y each time the hotspot starts.
 */
object TableCode {
    fun encode(ip: String): String? {
        val p = ip.split(".").mapNotNull { it.toIntOrNull() }
        if (p.size != 4 || p[0] != 192 || p[1] != 168 || p.any { it !in 0..255 }) return null
        return (p[2] * 256 + p[3]).toString().padStart(5, '0')
    }

    fun decode(code: String): String? {
        val n = code.filter { it.isDigit() }.toIntOrNull() ?: return null
        if (code.filter { it.isDigit() }.length != 5 || n > 65535) return null
        return "192.168.${n / 256}.${n % 256}"
    }

    /** Private IPv4 addresses of this phone, hotspot-looking interfaces first. */
    fun localAddresses(): List<Pair<String, String>> {
        val out = mutableListOf<Pair<String, String>>()
        for (nif in NetworkInterface.getNetworkInterfaces()?.toList() ?: emptyList()) {
            if (!nif.isUp || nif.isLoopback) continue
            for (addr in nif.inetAddresses.toList()) {
                if (addr is Inet4Address && addr.isSiteLocalAddress) out += nif.name to addr.hostAddress!!
            }
        }
        val rank = { name: String -> if (name.startsWith("ap") || name.startsWith("swlan") || name.contains("softap")) 0 else if (name.startsWith("wlan")) 1 else 2 }
        return out.sortedBy { rank(it.first) }
    }
}
