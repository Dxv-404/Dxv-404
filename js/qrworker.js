importScripts('../vendor/jsQR.js');
self.onmessage = (e) => {
  const { data, w, h } = e.data;
  let out = null;
  try {
    const r = self.jsQR(new Uint8ClampedArray(data), w, h, { inversionAttempts: 'dontInvert' });
    out = r ? r.data : null;
  } catch { out = null; }
  self.postMessage(out);
};
