/* Мэшапер: изменение темпа и питча (WSOLA + ресемплинг). */
(function (root) {
  'use strict';

  const tick = () => new Promise((r) => setTimeout(r, 0));

  function hannPeriodic(n) {
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
    return w;
  }

  /**
   * Меняет темп без изменения высоты звука.
   * speed > 1 ускоряет (короче), speed < 1 замедляет (длиннее).
   */
  async function timeStretch(chs, speed, onProgress) {
    const N = 2048, Hs = 1024, D = 8, T = 768;
    const len = chs[0].length;
    const nch = chs.length;
    if (len < N * 2 || Math.abs(speed - 1) < 1e-6) return chs.map((c) => c.slice());
    const outLen = Math.max(1, Math.round(len / speed));
    const out = chs.map(() => new Float32Array(outLen + 2 * N));
    const win = hannPeriodic(N);

    const mono = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      let s = 0;
      for (let c = 0; c < nch; c++) s += chs[c][i];
      mono[i] = s / nch;
    }
    const dl = Math.floor(len / D);
    const dec = new Float32Array(dl);
    for (let i = 0; i < dl; i++) {
      let s = 0;
      for (let k = 0; k < D; k++) s += mono[i * D + k];
      dec[i] = s / D;
    }
    const cs = new Float64Array(dl + 1);
    for (let i = 0; i < dl; i++) cs[i + 1] = cs[i] + dec[i] * dec[i];

    const Ha = Hs * speed;
    const nd = N / D;

    // первый кадр: левая половина без окна, чтобы не было нарастания в начале
    for (let c = 0; c < nch; c++) {
      const o = out[c], x = chs[c];
      for (let i = 0; i < N; i++) o[i] += (i < Hs ? 1 : win[i]) * x[i];
    }
    let prev = 0;
    const nFrames = Math.ceil(outLen / Hs);
    let lastYield = Date.now();

    for (let k = 1; k <= nFrames; k++) {
      const ideal = Math.round(k * Ha);
      let refS = prev + Hs;
      if (refS > len - N) refS = len - N;
      let lo = Math.max(0, ideal - T), hi = Math.min(len - N, ideal + T);
      if (lo > hi) lo = hi = Math.max(0, Math.min(len - N, ideal));

      // грубый поиск по прореженному сигналу
      const rd = Math.floor(refS / D);
      let best = -Infinity, bc = Math.floor(lo / D);
      const cLo = Math.ceil(lo / D), cHi = Math.floor(hi / D);
      for (let c = cLo; c <= cHi; c++) {
        if (c + nd > dl || rd + nd > dl) break;
        let dot = 0;
        for (let j = 0; j < nd; j++) dot += dec[c + j] * dec[rd + j];
        const sc = dot / Math.sqrt(cs[c + nd] - cs[c] + 1e-9);
        if (sc > best) { best = sc; bc = c; }
      }
      // точный поиск на полной частоте
      const centre = bc * D;
      let bestPos = Math.max(lo, Math.min(hi, centre));
      best = -Infinity;
      for (let p = Math.max(lo, centre - D); p <= Math.min(hi, centre + D); p++) {
        let dot = 0, e = 1e-9;
        for (let j = 0; j < N; j += 2) {
          const a = mono[p + j];
          dot += a * mono[refS + j]; e += a * a;
        }
        const sc = dot / Math.sqrt(e);
        if (sc > best) { best = sc; bestPos = p; }
      }

      const o0 = k * Hs;
      for (let c = 0; c < nch; c++) {
        const o = out[c], x = chs[c];
        for (let i = 0; i < N; i++) o[o0 + i] += win[i] * x[bestPos + i];
      }
      prev = bestPos;

      if ((k & 63) === 0 && Date.now() - lastYield > 40) {
        if (onProgress) onProgress(k / nFrames);
        await tick();
        lastYield = Date.now();
      }
    }
    if (onProgress) onProgress(1);
    return out.map((o) => o.subarray(0, outLen));
  }

  /** y[n] = x[n * ratio], кубическая интерполяция. */
  function resample(x, ratio) {
    const len = x.length;
    const outLen = Math.max(1, Math.floor((len - 1) / ratio));
    const y = new Float32Array(outLen);
    for (let n = 0; n < outLen; n++) {
      const t = n * ratio;
      const i = Math.floor(t), f = t - i;
      const p0 = i > 0 ? x[i - 1] : x[0];
      const p1 = x[i];
      const p2 = i + 1 < len ? x[i + 1] : x[len - 1];
      const p3 = i + 2 < len ? x[i + 2] : x[len - 1];
      y[n] = 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
        (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
    }
    return y;
  }

  /** Сдвигает питч на semis полутонов, длительность не меняется. */
  async function pitchShift(chs, semis, onProgress) {
    if (semis === 0) return chs.map((c) => c.slice());
    const rho = Math.pow(2, semis / 12);
    const stretched = await timeStretch(chs, 1 / rho, onProgress);
    return stretched.map((c) => resample(c, rho));
  }

  const api = { timeStretch, resample, pitchShift };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MashaperDsp = api;
})(typeof self !== 'undefined' ? self : this);
