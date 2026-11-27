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
  async function timeStretch(chs, speed, onProgress, opt) {
    opt = opt || {};
    const N = opt.N || 2048, Hs = opt.Hs || 1024, D = 8, T = opt.T || 768;
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

  /* ---------- БПФ ---------- */
  const fftCache = {};
  function fftPlan(N) {
    if (fftCache[N]) return fftCache[N];
    const cosT = new Float64Array(N / 2), sinT = new Float64Array(N / 2);
    for (let i = 0; i < N / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / N); sinT[i] = Math.sin(2 * Math.PI * i / N); }
    const bits = Math.round(Math.log2(N)), rev = new Uint32Array(N);
    for (let i = 0; i < N; i++) { let r = 0; for (let j = 0; j < bits; j++) if (i & (1 << j)) r |= 1 << (bits - 1 - j); rev[i] = r; }
    return (fftCache[N] = { cosT, sinT, rev });
  }
  function fft(re, im, inv, N) {
    const { cosT, sinT, rev } = fftPlan(N);
    for (let i = 0; i < N; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    const sg = inv ? 1 : -1;
    for (let len = 2; len <= N; len <<= 1) {
      const h = len >> 1, st = N / len;
      for (let i = 0; i < N; i += len) {
        for (let j = 0, k = 0; j < h; j++, k += st) {
          const wr = cosT[k], wi = sg * sinT[k], a = i + j, b = a + h;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        }
      }
    }
  }
  const TWO_PI = 2 * Math.PI;

  /**
   * Фазовый вокодер с фиксацией фаз вокруг пиков (Laroche-Dolson): хорошо сохраняет
   * тональный материал (аккорды, голос, бас), но размазывает удары.
   */
  async function pvStretch(chs, speed, onProgress, N, Hs) {
    N = N || 2048; Hs = Hs || 512;
    const len = chs[0].length, nch = chs.length, H = N / 2;
    if (len < N * 2 || Math.abs(speed - 1) < 1e-6) return chs.map((c) => c.slice());
    const outLen = Math.max(1, Math.round(len / speed));
    const nFrames = Math.ceil(outLen / Hs) + 2;
    const out = chs.map(() => new Float32Array(outLen + 2 * N));
    const wsum = new Float32Array(outLen + 2 * N);
    const win = hannPeriodic(N);
    const re = new Float64Array(N), im = new Float64Array(N);
    const mg = new Float64Array(H + 1);
    // прошлые спектры: анализа (X) и синтеза (Y), комплексные
    const pXr = chs.map(() => new Float64Array(H + 1)), pXi = chs.map(() => new Float64Array(H + 1));
    const pYr = chs.map(() => new Float64Array(H + 1)), pYi = chs.map(() => new Float64Array(H + 1));
    const peaks = new Int32Array(H + 1);
    let lastYield = Date.now(), prevPos = 0;
    for (let k = 0; k < nFrames; k++) {
      const pos = Math.max(0, Math.min(len - N, Math.round(k * Hs * speed)));
      const da = k === 0 ? Hs * speed : Math.max(1, pos - prevPos);
      const o0 = k * Hs;
      for (let c = 0; c < nch; c++) {
        const x = chs[c];
        for (let i = 0; i < N; i++) { re[i] = x[pos + i] * win[i]; im[i] = 0; }
        fft(re, im, false, N);
        const Xr = pXr[c], Xi = pXi[c], Yr = pYr[c], Yi = pYi[c];
        for (let b = 0; b <= H; b++) mg[b] = re[b] * re[b] + im[b] * im[b];
        if (k === 0) {
          for (let b = 0; b <= H; b++) { Yr[b] = re[b]; Yi[b] = im[b]; }
        } else {
          let np = 0;
          for (let b = 2; b < H - 1; b++) {
            const m = mg[b];
            if (m > mg[b - 1] && m >= mg[b + 1] && m > mg[b - 2] && m >= mg[b + 2] && m > 1e-14) peaks[np++] = b;
          }
          // новые Y считаем в re/im на месте (Y = X * e^{i*theta_peak}), старые Y нужны только в пиках, берём до записи
          const th = new Float64Array(np);
          for (let pi = 0; pi < np; pi++) {
            const p = peaks[pi], om = TWO_PI * p / N;
            const phNow = Math.atan2(im[p], re[p]), phPrev = Math.atan2(Xi[p], Xr[p]), sPrev = Math.atan2(Yi[p], Yr[p]);
            let d = phNow - phPrev - om * da;
            d -= TWO_PI * Math.round(d / TWO_PI);
            th[pi] = sPrev + (om + d / da) * Hs - phNow;
          }
          for (let pi = 0; pi < np; pi++) {
            const p = peaks[pi];
            const lo = pi === 0 ? 0 : (peaks[pi - 1] + p + 1) >> 1;
            const hi = pi === np - 1 ? H : (p + peaks[pi + 1]) >> 1;
            const cr = Math.cos(th[pi]), ci = Math.sin(th[pi]);
            for (let b = lo; b <= hi; b++) {
              const r0 = re[b], i0 = im[b];
              Yr[b] = r0 * cr - i0 * ci; Yi[b] = r0 * ci + i0 * cr;
            }
          }
          if (np === 0) for (let b = 0; b <= H; b++) { Yr[b] = re[b]; Yi[b] = im[b]; }
        }
        // запоминаем X текущего кадра
        for (let b = 0; b <= H; b++) { Xr[b] = re[b]; Xi[b] = im[b]; }
        for (let b = 0; b <= H; b++) { re[b] = Yr[b]; im[b] = Yi[b]; }
        for (let b = 1; b < H; b++) { re[N - b] = re[b]; im[N - b] = -im[b]; }
        im[0] = 0; im[H] = 0;
        fft(re, im, true, N);
        const o = out[c];
        for (let i = 0; i < N; i++) o[o0 + i] += win[i] * re[i] / N;
      }
      for (let i = 0; i < N; i++) wsum[o0 + i] += win[i] * win[i];
      prevPos = pos;
      if ((k & 15) === 0 && Date.now() - lastYield > 40) {
        if (onProgress) onProgress(k / nFrames);
        await tick();
        lastYield = Date.now();
      }
    }
    if (onProgress) onProgress(1);
    return out.map((o) => {
      const r = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) r[i] = o[i] / Math.max(wsum[i], 0.2);
      return r;
    });
  }

  /**
   * Разделение на гармоническую и ударную части (медианная фильтрация спектрограммы).
   * Сумма частей равна исходному сигналу. Возвращает { harm, perc } (по каналам).
   */
  async function hpss(chs, onProgress, bias) {
    const N = 2048, Hp = 512, H = N / 2, TM = 8, FM = 5;
    const B2 = (bias || 1) * (bias || 1);
    const len = chs[0].length, nch = chs.length;
    const win = hannPeriodic(N);
    const nF = Math.ceil((len + N) / Hp);
    const harm = chs.map(() => new Float32Array(len)), perc = chs.map(() => new Float32Array(len));
    const BLK = 400; // кадров в блоке (~4.6 с), перекрытие 2*TM кадров по краям
    const re = new Float64Array(N), im = new Float64Array(N);
    const nb = H + 1;
    const win2sum = 1.5;
    const tmp = new Float32Array(2 * Math.max(TM, FM) + 1);
    const med = (arr, n) => {
      for (let i = 1; i < n; i++) { const v = arr[i]; let j = i - 1; while (j >= 0 && arr[j] > v) { arr[j + 1] = arr[j]; j--; } arr[j + 1] = v; }
      return arr[n >> 1];
    };
    let lastYield = Date.now();
    for (let f0 = 0; f0 < nF; f0 += BLK) {
      const f1 = Math.min(nF, f0 + BLK);
      const a0 = Math.max(0, f0 - TM), a1 = Math.min(nF, f1 + TM);
      const nfr = a1 - a0;
      const Xr = [], Xi = [];
      for (let c = 0; c < nch; c++) { Xr.push(new Float32Array(nfr * nb)); Xi.push(new Float32Array(nfr * nb)); }
      const M = new Float32Array(nfr * nb);
      for (let f = 0; f < nfr; f++) {
        const start = (a0 + f) * Hp - N / 2 - 0; // центр кадра на (a0+f)*Hp
        for (let c = 0; c < nch; c++) {
          const x = chs[c];
          for (let i = 0; i < N; i++) { const p = start + i; re[i] = (p >= 0 && p < len ? x[p] : 0) * win[i]; im[i] = 0; }
          fft(re, im, false, N);
          for (let b = 0; b < nb; b++) {
            Xr[c][f * nb + b] = re[b]; Xi[c][f * nb + b] = im[b];
            M[f * nb + b] += Math.sqrt(re[b] * re[b] + im[b] * im[b]) / nch;
          }
        }
      }
      const Hm = new Float32Array(nfr * nb), Pm = new Float32Array(nfr * nb);
      for (let f = 0; f < nfr; f++) {
        for (let b = 0; b < nb; b++) {
          let n = 0;
          for (let g = Math.max(0, f - TM); g <= Math.min(nfr - 1, f + TM); g++) tmp[n++] = M[g * nb + b];
          Hm[f * nb + b] = med(tmp, n);
          n = 0;
          for (let g = Math.max(0, b - FM); g <= Math.min(nb - 1, b + FM); g++) tmp[n++] = M[f * nb + g];
          Pm[f * nb + b] = med(tmp, n);
        }
      }
      for (let c = 0; c < nch; c++) {
        for (let f = 0; f < nfr; f++) {
          const fr = a0 + f;
          if (fr < f0 || fr >= f1) continue;
          const start = fr * Hp - N / 2;
          for (let b = 0; b < nb; b++) {
            const h = Hm[f * nb + b], p = Pm[f * nb + b];
            const h2 = h * h * B2, mk = h2 / (h2 + p * p + 1e-12);
            re[b] = Xr[c][f * nb + b] * mk; im[b] = Xi[c][f * nb + b] * mk;
          }
          for (let b = 1; b < H; b++) { re[N - b] = re[b]; im[N - b] = -im[b]; }
          im[0] = 0; im[H] = 0;
          fft(re, im, true, N);
          const dst = harm[c];
          for (let i = 0; i < N; i++) {
            const p = start + i;
            if (p >= 0 && p < len) dst[p] += win[i] * re[i] / (N * win2sum);
          }
        }
      }
      if (onProgress) onProgress(f1 / nF);
      if (Date.now() - lastYield > 40) { await tick(); lastYield = Date.now(); }
    }
    for (let c = 0; c < nch; c++) { const x = chs[c], h = harm[c], p = perc[c]; for (let i = 0; i < len; i++) p[i] = x[i] - h[i]; }
    return { harm, perc };
  }

  /** y[n] = x[n * ratio]: оконный sinc с фильтром против наложения спектра при ratio > 1. */
  const SINC_Z = 16, SINC_RES = 256;
  let sincTab = null;
  function getSinc() {
    if (sincTab) return sincTab;
    sincTab = new Float32Array(SINC_Z * SINC_RES + 2);
    for (let i = 0; i < sincTab.length; i++) {
      const d = i / SINC_RES;
      const s = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
      const w = d >= SINC_Z ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * d / SINC_Z);
      sincTab[i] = s * w;
    }
    return sincTab;
  }
  function resample(x, ratio) {
    const len = x.length;
    const outLen = Math.max(1, Math.floor((len - 1) / ratio));
    const y = new Float32Array(outLen);
    const tab = getSinc();
    const sc = ratio > 1 ? 1 / ratio : 1;
    const half = SINC_Z / sc;
    for (let n = 0; n < outLen; n++) {
      const t = n * ratio;
      const j0 = Math.max(0, Math.ceil(t - half)), j1 = Math.min(len - 1, Math.floor(t + half));
      let s = 0;
      for (let j = j0; j <= j1; j++) {
        const d = Math.abs(t - j) * sc * SINC_RES;
        const i = d | 0, f = d - i;
        s += x[j] * (tab[i] + (tab[i + 1] - tab[i]) * f);
      }
      y[n] = s * sc;
    }
    return y;
  }

  /** Сдвигает питч на semis полутонов, длительность не меняется. */
  async function pitchShift(chs, semis, onProgress) {
    if (semis === 0) return chs.map((c) => c.slice());
    const rho = Math.pow(2, semis / 12);
    const len = chs[0].length;
    const nch = chs.length;
    if (len < 8192) {
      const st = await timeStretch(chs, 1 / rho, onProgress);
      return st.map((c) => resample(c, rho));
    }
    // 1) ударные и тональные части отдельно; 2) тональная: фазовый вокодер, ударная: WSOLA с коротким окном
    const prog = (a, b) => (p) => { if (onProgress) onProgress(a + (b - a) * p); };
    const { harm, perc } = await hpss(chs, prog(0, 0.3), 8);
    const hs = await pvStretch(harm, 1 / rho, prog(0.3, 0.75), 2048, 512);
    const ps = await timeStretch(perc, 1 / rho, prog(0.75, 0.9), { N: 512, Hs: 128, T: 192 });
    const res = [];
    for (let c = 0; c < nch; c++) {
      const a = resample(hs[c], rho), b = resample(ps[c], rho);
      const n = Math.min(a.length, b.length), o = new Float32Array(n);
      for (let i = 0; i < n; i++) o[i] = a[i] + b[i];
      res.push(o);
      if (onProgress) onProgress(0.9 + 0.1 * (c + 1) / nch);
    }
    return res;
  }

  /** Старый вариант (только WSOLA + ресемплинг) для сравнения в тестах. */
  async function pitchShiftSimple(chs, semis, onProgress) {
    if (semis === 0) return chs.map((c) => c.slice());
    const rho = Math.pow(2, semis / 12);
    const st = await timeStretch(chs, 1 / rho, onProgress);
    return st.map((c) => resample(c, rho));
  }

  const api = { timeStretch, resample, pitchShift, pitchShiftSimple, pvStretch, hpss };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MashaperDsp = api;
})(typeof self !== 'undefined' ? self : this);
