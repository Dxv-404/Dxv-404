import qrcode from '../vendor/qrcode.mjs';

// Draw a QR code as an SVG string (crisp at any size).
export function qrSvg(text, { dark = '#17110C', light = '#F7F1E3' } = {}) {
  const qr = qrcode(0, 'L');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const q = 2; // quiet zone (modules)
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  const size = n + q * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

// Camera scanner. Uses the native BarcodeDetector where available (Android Chrome),
// otherwise decodes frames with jsQR in a worker so the UI never stutters.
export class Scanner {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.running = false;
    this.worker = null;
    this.detector = null;
  }

  async start(onCode) {
    this.onCode = onCode;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play();
    if ('BarcodeDetector' in window) {
      try {
        const fmts = await window.BarcodeDetector.getSupportedFormats();
        if (fmts.includes('qr_code')) this.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch {}
    }
    if (!this.detector) {
      this.worker = new Worker(new URL('./qrworker.js', import.meta.url));
      this.worker.onmessage = (e) => { this.busy = false; if (e.data && this.running) this._found(e.data); };
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    this.running = true;
    window.__tpScanner = this; // lets automated tests feed a code
    this._loop();
  }

  _found(text) {
    if (!text.startsWith('PK1~')) return;
    this.running = false;
    this.onCode && this.onCode(text);
  }

  async _loop() {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2) {
      if (this.detector) {
        try {
          const codes = await this.detector.detect(v);
          if (codes.length) return this._found(codes[0].rawValue);
        } catch {}
      } else if (!this.busy) {
        const w = 640, h = Math.round((v.videoHeight / v.videoWidth) * 640) || 480;
        this.canvas.width = w; this.canvas.height = h;
        this.ctx.drawImage(v, 0, 0, w, h);
        const img = this.ctx.getImageData(0, 0, w, h);
        this.busy = true;
        this.worker.postMessage({ data: img.data.buffer, w, h }, [img.data.buffer]);
      }
    }
    setTimeout(() => requestAnimationFrame(() => this._loop()), 120);
  }

  stop() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.worker) this.worker.terminate();
    this.worker = null;
  }
}
