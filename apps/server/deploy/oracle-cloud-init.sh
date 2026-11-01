#!/bin/bash
# First-boot setup for the Train Poker table server on an Oracle Cloud Always Free machine (Ubuntu).
# Installs Node.js and Caddy, opens ports 80/443, serves the table server over HTTPS at
# <public-ip-with-dashes>.sslip.io, and keeps it updated from the server-deploy branch on GitHub.
# Safe to run again: every step checks what is already there.
set -euxo pipefail
exec > >(tee -a /var/log/tp-setup.log) 2>&1

REPO_RAW="https://raw.githubusercontent.com/Dxv-404/Dxv-404/server-deploy/server"
NODE_VERSION="22.21.1"
ARCH="$(uname -m)"
case "$ARCH" in x86_64) NARCH=x64; CARCH=amd64 ;; aarch64) NARCH=arm64; CARCH=arm64 ;; *) echo "unsupported $ARCH"; exit 1 ;; esac

# 1. Oracle's Ubuntu images reject everything except SSH in iptables; open web ports.
# The image ends INPUT with a REJECT rule: the new rules must go in front of it.
for port in 80 443; do
  if ! iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    pos="$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" {print $1; exit}')"
    iptables -I INPUT "${pos:-1}" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  fi
done
netfilter-persistent save || true
iptables -L INPUT -n --line-numbers

# 2. A little swap so the 1 GB machine never runs out of memory.
if [ ! -f /swapfile ]; then fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi

# 3. Node.js (official build) and Caddy (automatic HTTPS).
if [ ! -x /opt/node/bin/node ]; then
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NARCH}.tar.xz" -o /tmp/node.tar.xz
  mkdir -p /opt/node && tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components=1
fi
if [ ! -x /usr/local/bin/caddy ]; then
  curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=${CARCH}" -o /usr/local/bin/caddy && chmod +x /usr/local/bin/caddy
fi
id -u tp >/dev/null 2>&1 || useradd --system --home /opt/tp --shell /usr/sbin/nologin tp
mkdir -p /opt/tp /etc/caddy /var/lib/caddy && chown -R tp:tp /opt/tp

# 4. Updater: fetch the latest build; restart only when the version changed.
cat > /opt/tp/update.sh <<'UPD'
#!/bin/bash
set -euo pipefail
REPO_RAW="https://raw.githubusercontent.com/Dxv-404/Dxv-404/server-deploy/server"
new="$(curl -fsSL "$REPO_RAW/VERSION?t=$(date +%s)" | tr -d '[:space:]')"
old="$(cat /opt/tp/VERSION 2>/dev/null || true)"
# Optional maintenance script (runs as root once per new version) so the machine can be fixed without SSH.
snew="$(curl -fsSL "$REPO_RAW/SYSTEM_VERSION?t=$(date +%s)" 2>/dev/null | tr -d '[:space:]' || true)"
sold="$(cat /opt/tp/SYSTEM_VERSION 2>/dev/null || true)"
if [ -n "$snew" ] && [ "$snew" != "$sold" ]; then
  curl -fsSL "$REPO_RAW/system.sh?t=$(date +%s)" -o /opt/tp/system.sh.new
  if [ "$(sha256sum /opt/tp/system.sh.new | cut -c1-12)" = "$snew" ]; then
    mv /opt/tp/system.sh.new /opt/tp/system.sh && chmod 700 /opt/tp/system.sh
    /opt/tp/system.sh > /var/log/tp-system.log 2>&1 || true
    echo "$snew" > /opt/tp/SYSTEM_VERSION
  fi
fi
if [ -n "$new" ] && [ "$new" != "$old" ]; then
  curl -fsSL "$REPO_RAW/node-server.mjs?t=$(date +%s)" -o /opt/tp/node-server.mjs.new
  # only switch to a download that matches its version stamp
  if [ "$(sha256sum /opt/tp/node-server.mjs.new | cut -c1-12)" = "$new" ]; then
    mv /opt/tp/node-server.mjs.new /opt/tp/node-server.mjs
    echo "$new" > /opt/tp/VERSION
    chown tp:tp /opt/tp/node-server.mjs /opt/tp/VERSION
    systemctl restart tp-server
    echo "updated to $new"
  fi
fi
UPD
chmod +x /opt/tp/update.sh

# 5. Services.
cat > /etc/systemd/system/tp-server.service <<'SVC'
[Unit]
Description=Train Poker table server
After=network-online.target
[Service]
User=tp
Environment=PORT=8080 SITE_NAME=HYD
Environment=VERSION_FILE=/opt/tp/VERSION DATA_DIR=/opt/tp/data
ExecStart=/opt/node/bin/node /opt/tp/node-server.mjs
Restart=always
RestartSec=2
MemoryMax=600M
[Install]
WantedBy=multi-user.target
SVC
cat > /etc/systemd/system/tp-update.service <<'SVC'
[Unit]
Description=Fetch the latest Train Poker table server build
[Service]
Type=oneshot
ExecStart=/opt/tp/update.sh
SVC
cat > /etc/systemd/system/tp-update.timer <<'SVC'
[Unit]
Description=Check for a new table server build every 2 minutes
[Timer]
OnBootSec=20s
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
SVC

PUBLIC_IP="$(curl -fsS https://api.ipify.org)"
HOST="$(echo "$PUBLIC_IP" | tr . -).sslip.io"
cat > /etc/caddy/Caddyfile <<CAD
${HOST} {
  encode gzip
  reverse_proxy 127.0.0.1:8080
}
CAD
cat > /etc/systemd/system/caddy.service <<'SVC'
[Unit]
Description=Caddy (HTTPS in front of the table server)
After=network-online.target
[Service]
Environment=XDG_DATA_HOME=/var/lib/caddy XDG_CONFIG_HOME=/var/lib/caddy
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile
Restart=always
AmbientCapabilities=CAP_NET_BIND_SERVICE
[Install]
WantedBy=multi-user.target
SVC

/opt/tp/update.sh || true
systemctl daemon-reload
systemctl enable --now tp-server tp-update.timer caddy
sleep 15
echo "--- self-check ---"
ss -ltnp | grep -E ':(80|443|8080) ' || true
curl -s --max-time 5 http://127.0.0.1:8080/health || echo "local server not answering"
curl -sk --max-time 10 "https://${HOST}/health" --resolve "${HOST}:443:127.0.0.1" || echo "https not answering locally"
journalctl -u caddy --no-pager -n 15 || true
echo "TRAIN POKER SERVER READY at https://${HOST}"
