/* Мэшапер: экспорт в WAV и MP3. */
(function (root) {
  'use strict';
  const tick = () => new Promise((r) => setTimeout(r, 0));

  function toInt16(x) {
    const y = new Int16Array(x.length);
    for (let i = 0; i < x.length; i++) {
      const v = Math.max(-1, Math.min(1, x[i]));
      y[i] = v < 0 ? v * 32768 : v * 32767;
    }
    return y;
  }

  function encodeWav(chs, sr) {
    const nch = chs.length, len = chs[0].length;
    const dataBytes = len * nch * 2;
    const buf = new ArrayBuffer(44 + dataBytes);
    const dv = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); dv.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE');
    str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nch, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * nch * 2, true); dv.setUint16(32, nch * 2, true); dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, dataBytes, true);
    let o = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < nch; c++) {
        const v = Math.max(-1, Math.min(1, chs[c][i]));
        dv.setInt16(o, v < 0 ? v * 32768 : v * 32767, true);
        o += 2;
      }
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  let lameLoading = null;
  function loadLame() {
    if (root.lamejs) return Promise.resolve();
    if (!lameLoading) {
      lameLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
        s.onload = () => (root.lamejs ? resolve() : reject(new Error('lamejs не загрузился')));
        s.onerror = () => { lameLoading = null; reject(new Error('Не удалось загрузить MP3-кодировщик')); };
        document.head.appendChild(s);
      });
    }
    return lameLoading;
  }

  async function encodeMp3(chs, sr, onProgress) {
    await loadLame();
    const nch = Math.min(2, chs.length);
    const enc = new root.lamejs.Mp3Encoder(nch, sr, 192);
    const left = toInt16(chs[0]), right = nch > 1 ? toInt16(chs[1]) : null;
    const parts = [];
    const block = 1152 * 20;
    let last = Date.now();
    for (let i = 0; i < left.length; i += block) {
      const l = left.subarray(i, i + block);
      const out = nch > 1 ? enc.encodeBuffer(l, right.subarray(i, i + block)) : enc.encodeBuffer(l);
      if (out.length) parts.push(new Uint8Array(out));
      if (Date.now() - last > 40) {
        if (onProgress) onProgress(i / left.length);
        await tick(); last = Date.now();
      }
    }
    const end = enc.flush();
    if (end.length) parts.push(new Uint8Array(end));
    if (onProgress) onProgress(1);
    return new Blob(parts, { type: 'audio/mpeg' });
  }

  root.MashaperOut = { encodeWav, encodeMp3 };
})(typeof self !== 'undefined' ? self : this);
