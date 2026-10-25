/* Мэшапер: анализ тональности и BPM, план подгонки. Работает и в браузере, и в Node. */
(function (root) {
  'use strict';

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  // Профили Альбрехта и Шанахана (2013): точнее профилей Краусса-Кесслера на реальных записях
  const KEY_MAJOR = [0.238, 0.006, 0.111, 0.006, 0.137, 0.094, 0.016, 0.214, 0.009, 0.080, 0.008, 0.081];
  const KEY_MINOR = [0.220, 0.006, 0.104, 0.123, 0.019, 0.103, 0.012, 0.214, 0.062, 0.022, 0.061, 0.052];

  // ---------- FFT ----------
  const twiddles = {};
  function getTwiddles(n) {
    if (!twiddles[n]) {
      const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
      for (let i = 0; i < n / 2; i++) {
        cos[i] = Math.cos(-2 * Math.PI * i / n);
        sin[i] = Math.sin(-2 * Math.PI * i / n);
      }
      twiddles[n] = { cos, sin };
    }
    return twiddles[n];
  }

  function fft(re, im) {
    const n = re.length;
    const { cos, sin } = getTwiddles(n);
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step], wi = sin[k * step];
          const a = i + k, b = a + half;
          const vr = re[b] * wr - im[b] * wi;
          const vi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - vr; im[b] = im[a] - vi;
          re[a] += vr; im[a] += vi;
        }
      }
    }
  }

  function hann(n) {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
    return w;
  }

  // ---------- Подготовка ----------
  /** Смешивает каналы в моно и понижает частоту до ~22 кГц. */
  function toMono(channels, sampleRate) {
    const factor = Math.max(1, Math.round(sampleRate / 22050));
    const len = channels[0].length;
    const n = Math.floor(len / factor);
    const out = new Float32Array(n);
    const nch = channels.length;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let c = 0; c < nch; c++) {
        const ch = channels[c];
        for (let k = 0; k < factor; k++) s += ch[i * factor + k];
      }
      out[i] = s / (nch * factor);
    }
    return { data: out, sr: sampleRate / factor };
  }

  // ---------- Тональность ----------
  function pearson(a, b) {
    let ma = 0, mb = 0;
    for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
    ma /= a.length; mb /= b.length;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) {
      const x = a[i] - ma, y = b[i] - mb;
      num += x * y; da += x * x; db += y * y;
    }
    return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
  }

  /** Находит спектральные пики кадра: [[частота, относительная амплитуда], ...]. */
  function spectralPeaks(mag, sr, N, fmin, fmax) {
    const out = [];
    const kmin = Math.max(2, Math.ceil(fmin * N / sr)), kmax = Math.min(N / 2 - 2, Math.floor(fmax * N / sr));
    let mx = 0;
    for (let k = kmin; k <= kmax; k++) if (mag[k] > mx) mx = mag[k];
    if (mx <= 0) return out;
    const thr = mx * 0.02;
    for (let k = kmin; k <= kmax; k++) {
      const b = mag[k];
      if (b > thr && b > mag[k - 1] && b >= mag[k + 1]) {
        const a = mag[k - 1], c = mag[k + 1], den = a - 2 * b + c;
        const d = den < 0 ? 0.5 * (a - c) / den : 0;
        out.push([(k + d) * sr / N, b / mx]);
      }
    }
    return out;
  }

  function scoreKeys(chroma) {
    const all = [];
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const mode of ['major', 'minor']) {
        const prof = mode === 'major' ? KEY_MAJOR : KEY_MINOR;
        const rotated = new Array(12);
        for (let i = 0; i < 12; i++) rotated[i] = prof[((i - tonic) % 12 + 12) % 12];
        all.push({ tonic, mode, score: pearson(Array.from(chroma), rotated) });
      }
    }
    return all.sort((a, b) => b.score - a.score);
  }

  /** Выбирает тональность по хромаграмме. restrictSet: номер мажорной гаммы (0-11), если набор нот уже известен. */
  function keyFromChroma(chroma, tuning, restrictSet) {
    let all = scoreKeys(chroma);
    if (restrictSet !== undefined) {
      all = all.filter((k) => (k.mode === 'major' ? k.tonic : (k.tonic + 3) % 12) === restrictSet);
    }
    let best = all[0];
    // Если у тоники не слышно, какая терция (малая или большая), лад не определить по нотам.
    // Тогда выбираем минор: так чаще бывает в электронной музыке и в GD.
    const t = best.tonic, minorThird = chroma[(t + 3) % 12], majorThird = chroma[(t + 4) % 12];
    const thirdRatio = Math.max(minorThird, majorThird) / Math.max(1e-9, Math.min(minorThird, majorThird));
    let ambiguousMode = false;
    if (thirdRatio < 1.25 && restrictSet === undefined) {
      ambiguousMode = true;
      best = all.find((k) => k.tonic === t && k.mode === 'minor');
    }
    const alternatives = all.filter((k) => k !== best).slice(0, 2);
    return { tonic: best.tonic, mode: best.mode, score: best.score, tuning, ambiguousMode, alternatives };
  }

  /** Хромаграмма каждого кадра: пики спектра, оценка строя, учёт близости к полутонам. */
  function keyFrames(mono) {
    const { data, sr } = mono;
    const N = 8192;
    const hop = Math.max(N / 2, Math.ceil((data.length - N) / 1600));
    const total = Math.floor((data.length - N) / hop) + 1;
    if (total < 4) return null;
    const win = hann(N);
    const re = new Float64Array(N), im = new Float64Array(N);
    const frames = [];
    for (let f = 0; f < total; f++) {
      let e = 0;
      for (let i = 0; i < N; i++) { const v = data[f * hop + i]; re[i] = v * win[i]; im[i] = 0; e += v * v; }
      fft(re, im);
      const mag = new Float32Array(N / 2);
      for (let k = 0; k < N / 2; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      frames.push({ e, peaks: spectralPeaks(mag, sr, N, 55, 3500) });
    }
    const sorted = frames.map((x) => x.e).sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    let cs = 0, sn = 0;
    for (const fr of frames) {
      if (fr.e < med * 0.05 || fr.e <= 1e-9) continue;
      for (const [f, w] of fr.peaks) {
        const p = 69 + 12 * Math.log2(f / 440), dev = p - Math.round(p);
        cs += w * Math.cos(2 * Math.PI * dev); sn += w * Math.sin(2 * Math.PI * dev);
      }
    }
    const tuning = Math.atan2(sn, cs) / (2 * Math.PI);
    const out = [];
    frames.forEach((fr, j) => {
      const t = (j * hop + N / 2) / sr;
      if (fr.e < med * 0.05 || fr.e <= 1e-9) { out.push({ t, chroma: null, bass: null }); return; }
      const loc = new Float64Array(12), low = new Float64Array(12);
      for (const [f, w] of fr.peaks) {
        const p = 69 + 12 * Math.log2(f / 440) - tuning, r = Math.round(p), dev = p - r;
        const v = Math.sqrt(w) * Math.cos(Math.PI * dev) ** 2;
        loc[((r % 12) + 12) % 12] += v;
        if (f < 250) low[((r % 12) + 12) % 12] += v;
      }
      let sb = 0;
      for (let i = 0; i < 12; i++) sb += low[i];
      if (sb > 0) for (let i = 0; i < 12; i++) low[i] /= sb;
      let sum = 0;
      for (let i = 0; i < 12; i++) sum += loc[i];
      if (sum > 0) for (let i = 0; i < 12; i++) loc[i] /= sum;
      out.push({ t, chroma: sum > 0 ? loc : null, bass: sb > 0 ? low : null });
    });
    return { frames: out, tuning, duration: data.length / sr };
  }

  function sumChroma(frames, t0, t1) {
    const c = new Float64Array(12);
    for (const fr of frames) if (fr.chroma && fr.t >= t0 && fr.t < t1) for (let i = 0; i < 12; i++) c[i] += fr.chroma[i];
    return c;
  }

  /**
   * Ищет смены тональности. Считает оценку для каждой из 12 гамм в скользящем окне,
   * затем сглаживает путь (Витерби) со штрафом за переход. Относительные тональности
   * (C major и A minor) состоят из одних нот, поэтому сменой не считаются.
   */
  function findKeyChanges(kf) {
    const { frames, tuning, duration } = kf;
    const STEP = 2, HALF = 5, PENALTY = 0.2, MIN_SEG = 15, MIN_MARGIN = 0.1;
    const steps = Math.max(1, Math.floor(duration / STEP));
    const emis = [];
    for (let i = 0; i < steps; i++) {
      const c = (i + 0.5) * STEP;
      const chroma = sumChroma(frames, c - HALF, c + HALF);
      const e = new Float64Array(12);
      let any = false;
      for (let i2 = 0; i2 < 12; i2++) if (chroma[i2] > 0) any = true;
      if (any) {
        for (const k of scoreKeys(chroma)) {
          const set = k.mode === 'major' ? k.tonic : (k.tonic + 3) % 12;
          if (k.score > e[set]) e[set] = k.score;
        }
      }
      emis.push(e);
    }
    // Витерби
    const best = [], from = [];
    for (let i = 0; i < steps; i++) {
      const b = new Float64Array(12), fr = new Int8Array(12);
      for (let s = 0; s < 12; s++) {
        if (i === 0) { b[s] = emis[0][s]; continue; }
        let bestPrev = best[i - 1][s], arg = s;
        for (let s2 = 0; s2 < 12; s2++) {
          const v = best[i - 1][s2] - PENALTY;
          if (v > bestPrev) { bestPrev = v; arg = s2; }
        }
        b[s] = bestPrev + emis[i][s]; fr[s] = arg;
      }
      best.push(b); from.push(fr);
    }
    let s = 0;
    for (let k = 1; k < 12; k++) if (best[steps - 1][k] > best[steps - 1][s]) s = k;
    const path = new Array(steps);
    for (let i = steps - 1; i >= 0; i--) { path[i] = s; if (i > 0) s = from[i][s]; }
    let segs = [];
    for (let i = 0; i < steps; i++) {
      if (segs.length && segs[segs.length - 1].set === path[i]) segs[segs.length - 1].end = (i + 1) * STEP;
      else segs.push({ set: path[i], start: i * STEP, end: (i + 1) * STEP });
    }
    segs[segs.length - 1].end = duration;
    // короткие куски присоединяем к соседям
    let changed = true;
    while (changed && segs.length > 1) {
      changed = false;
      for (let i = 0; i < segs.length; i++) {
        if (segs[i].end - segs[i].start < MIN_SEG) {
          const j = i === 0 ? 1 : i - 1;
          segs[j].start = Math.min(segs[j].start, segs[i].start);
          segs[j].end = Math.max(segs[j].end, segs[i].end);
          segs.splice(i, 1);
          changed = true;
          break;
        }
      }
      for (let i = 1; i < segs.length; i++) {
        if (segs[i].set === segs[i - 1].set) { segs[i - 1].end = segs[i].end; segs.splice(i, 1); i--; }
      }
    }
    // Слабо подтверждённые куски (их набор нот почти не лучше соседнего) считаем шумом
    const setScore = (chroma, set) => {
      let b = -2;
      for (const k of scoreKeys(chroma)) {
        if ((k.mode === 'major' ? k.tonic : (k.tonic + 3) % 12) === set && k.score > b) b = k.score;
      }
      return b;
    };
    while (segs.length > 1) {
      let worst = -1, worstMargin = Infinity, worstTarget = -1;
      segs.forEach((sg, i) => {
        const c = sumChroma(frames, sg.start, sg.end);
        const own = setScore(c, sg.set);
        for (const j of [i - 1, i + 1]) {
          if (j < 0 || j >= segs.length || segs[j].set === sg.set) continue;
          const margin = own - setScore(c, segs[j].set);
          if (margin < worstMargin) { worstMargin = margin; worst = i; worstTarget = j; }
        }
      });
      if (worst < 0 || worstMargin >= MIN_MARGIN) break;
      const a = segs[worstTarget], b = segs[worst];
      a.start = Math.min(a.start, b.start); a.end = Math.max(a.end, b.end);
      segs.splice(worst, 1);
      for (let i = 1; i < segs.length; i++) {
        if (segs[i].set === segs[i - 1].set) { segs[i - 1].end = segs[i].end; segs.splice(i, 1); i--; }
      }
    }
    return segs.map((sg) => {
      const key = keyFromChroma(sumChroma(frames, sg.start, sg.end), tuning, segs.length > 1 ? sg.set : undefined);
      return { start: sg.start, end: sg.end, key };
    });
  }

  /**
   * Варианты для быстрого исправления: лучшие по ощущению нот плюс тональность с самой частой басовой нотой.
   * Нужны, потому что по одним нотам тонику часто можно назвать по-разному.
   */
  function keyCandidates(frames, chosen) {
    const chroma = sumChroma(frames, 0, Infinity);
    const bass = new Float64Array(12);
    for (const fr of frames) if (fr.bass) for (let i = 0; i < 12; i++) bass[i] += fr.bass[i];
    let bassTonic = 0;
    for (let i = 1; i < 12; i++) if (bass[i] > bass[bassTonic]) bassTonic = i;
    const all = scoreKeys(chroma);
    const same = (a, b) => a.tonic === b.tonic && a.mode === b.mode;
    const list = [];
    for (const k of all) {
      if (same(k, chosen)) continue;
      if (list.length < 3) list.push({ tonic: k.tonic, mode: k.mode, score: k.score, tag: '' });
    }
    const hasBass = list.some((k) => k.tonic === bassTonic) || chosen.tonic === bassTonic;
    if (!hasBass) {
      const k = all.find((x) => x.tonic === bassTonic && !same(x, chosen));
      if (k) list.push({ tonic: k.tonic, mode: k.mode, score: k.score, tag: 'по басу' });
    } else {
      for (const k of list) if (k.tonic === bassTonic) k.tag = 'по басу';
    }
    return list;
  }

  /** Возвращает { key, changes }: общая тональность и список смен (время в секундах). */
  function analyzeKey(mono) {
    const kf = keyFrames(mono);
    if (!kf) return { key: { tonic: 0, mode: 'major', score: 0, tuning: 0, alternatives: [], candidates: [] }, changes: [], segments: [] };
    const whole = keyFromChroma(sumChroma(kf.frames, 0, Infinity), kf.tuning);
    const segments = findKeyChanges(kf);
    let key = whole, changes = [];
    if (segments.length > 1) {
      // основная тональность: самый длинный кусок
      let main = segments[0];
      for (const sg of segments) if (sg.end - sg.start > main.end - main.start) main = sg;
      key = main.key;
      for (let i = 1; i < segments.length; i++) changes.push({ time: segments[i].start, from: segments[i - 1].key, to: segments[i].key });
    }
    key.candidates = keyCandidates(kf.frames, key);
    return { key, changes, segments };
  }

  function detectKey(mono) { return analyzeKey(mono).key; }

  // ---------- BPM ----------
  function onsetEnvelope(mono, maxSec) {
    const { data, sr } = mono;
    const N = 1024, hop = 256;
    let peak = 0;
    const seg = Math.min(data.length, Math.floor((maxSec || 200) * sr));
    const start = Math.max(0, Math.floor((data.length - seg) / 2));
    for (let i = start; i < start + seg; i++) peak = Math.max(peak, Math.abs(data[i]));
    if (peak <= 0) return { env: new Float64Array(0), fps: sr / hop };
    const scale = 1 / peak;
    const kmin = 2, kmax = Math.min(N / 2 - 1, Math.floor(6000 * N / sr));
    const nb = kmax - kmin + 1;
    const win = hann(N);
    const re = new Float64Array(N), im = new Float64Array(N);
    const frames = Math.floor((seg - N) / hop) + 1;
    const env = new Float64Array(Math.max(0, frames));
    let prev = new Float64Array(nb), cur = new Float64Array(nb);
    for (let f = 0; f < frames; f++) {
      const o = start + f * hop;
      for (let i = 0; i < N; i++) { re[i] = data[o + i] * scale * win[i]; im[i] = 0; }
      fft(re, im);
      let flux = 0;
      for (let b = 0; b < nb; b++) {
        const k = kmin + b;
        cur[b] = Math.log1p(Math.sqrt(re[k] * re[k] + im[k] * im[k]));
        if (f > 0) { const d = cur[b] - prev[b]; if (d > 0) flux += d; }
      }
      env[f] = flux / nb;
      const t = prev; prev = cur; cur = t;
    }
    return { env, fps: sr / hop };
  }

  /** Определяет BPM (диапазон 70-180) по спектру огибающей атак. */
  function detectBpm(mono) {
    const { env, fps } = onsetEnvelope(mono);
    const M = env.length;
    if (M < fps * 8) return { bpm: 0, confidence: 0 };
    // убираем медленный тренд и выпрямляем
    const w = Math.round(fps * 0.5);
    const o = new Float64Array(M);
    const pre = new Float64Array(M + 1);
    for (let i = 0; i < M; i++) pre[i + 1] = pre[i] + env[i];
    for (let i = 0; i < M; i++) {
      const a = Math.max(0, i - w), b = Math.min(M, i + w + 1);
      const mean = (pre[b] - pre[a]) / (b - a);
      o[i] = Math.max(0, env[i] - mean);
    }
    const hw = hann(M);
    for (let i = 0; i < M; i++) o[i] *= hw[i];

    const lo = 70, hi = 180, step = 0.1;
    const nCand = Math.round((hi - lo) / step) + 1;
    const scores = new Float64Array(nCand);
    const weights = [1, 0.6, 0.4];
    for (let c = 0; c < nCand; c++) {
      const bpm = lo + c * step;
      let score = 0;
      for (let h = 1; h <= 3; h++) {
        const th = 2 * Math.PI * h * bpm / 60 / fps;
        const cs = Math.cos(th), sn = Math.sin(th);
        let cr = 1, ci = 0, re = 0, im = 0;
        for (let n = 0; n < M; n++) {
          const v = o[n];
          re += v * cr; im += v * ci;
          const t = cr * cs - ci * sn;
          ci = cr * sn + ci * cs; cr = t;
        }
        score += weights[h - 1] * Math.sqrt(re * re + im * im);
      }
      scores[c] = score;
    }
    // Мягкое предпочтение привычных темпов около 125 BPM: так 4:3-эхо (например, 172 вместо 129) не побеждает настоящий темп
    const weighted = new Float64Array(nCand);
    let bi = 0, mean = 0;
    for (let c = 0; c < nCand; c++) {
      mean += scores[c];
      const oct = Math.log2((lo + c * step) / 125);
      weighted[c] = scores[c] * Math.exp(-0.5 * (oct / 0.55) ** 2);
      if (weighted[c] > weighted[bi]) bi = c;
    }
    mean /= nCand;
    const refine = (i) => {
      let v = lo + i * step;
      if (i > 0 && i < nCand - 1) {
        const a = scores[i - 1], b = scores[i], c = scores[i + 1];
        const den = a - 2 * b + c;
        if (den < 0) v += 0.5 * (a - c) / den * step;
      }
      return v;
    };
    const bpm = refine(bi);
    // другие заметные пики: на случай, если автоопределение выбрало не тот
    const peaks = [];
    for (let i = 2; i < nCand - 2; i++) {
      if (scores[i] > scores[i - 1] && scores[i] >= scores[i + 1] && scores[i] > scores[i - 2] && scores[i] >= scores[i + 2]) peaks.push(i);
    }
    peaks.sort((x, y) => scores[y] - scores[x]);
    const top = scores[peaks.length ? peaks[0] : bi] || 1;
    const candidates = [];
    for (const i of peaks) {
      const v = refine(i);
      if (Math.abs(v / bpm - 1) < 0.015) continue;
      if (candidates.some((c) => Math.abs(c.bpm / v - 1) < 0.015)) continue;
      if (scores[i] < 0.3 * top) break;
      candidates.push({ bpm: v, strength: scores[i] / top });
      if (candidates.length >= 3) break;
    }
    return { bpm, confidence: mean > 0 ? scores[bi] / mean : 0, candidates };
  }


  /** Одинаковый ли это темп: с точностью до удвоения и пульсов 4:3 и 3:2 (эхо и триоли). */
  function sameTempo(a, b, tol) {
    let r = a / b;
    while (r >= 2) r /= 2;
    while (r < 1) r *= 2;
    // 4:3 и 3:2 бывают только у точных полиритмов, поэтому допуск для них уже
    return Math.abs(r - 1) < tol || Math.abs(r / 2 - 1) < tol ||
      Math.abs(r / (4 / 3) - 1) < 0.01 || Math.abs(r / 1.5 - 1) < 0.01;
  }

  /**
   * Ищет участки с другим темпом. Считает темп в скользящем окне 24 с и сравнивает с основным.
   * Возвращает [{ start, end, bpm }] только для участков, где темп отличается (время в секундах).
   */
  function detectTempoChanges(mono, mainBpm) {
    if (!(mainBpm > 0)) return [];
    const { env, fps } = onsetEnvelope(mono, 900);
    const M = env.length;
    const WIN = 24, STEP = 6;
    if (M < fps * (WIN + STEP)) return [];
    const wTr = Math.round(fps * 0.5);
    const o = new Float64Array(M), pre = new Float64Array(M + 1);
    for (let i = 0; i < M; i++) pre[i + 1] = pre[i] + env[i];
    for (let i = 0; i < M; i++) {
      const a = Math.max(0, i - wTr), b = Math.min(M, i + wTr + 1);
      o[i] = Math.max(0, env[i] - (pre[b] - pre[a]) / (b - a));
    }
    const lo = 70, hi = 180, step = 0.25, nCand = Math.round((hi - lo) / step) + 1;
    const wl = Math.round(WIN * fps);
    const hw = hann(wl);
    const seg = new Float64Array(wl);
    const wins = [];
    for (let t0 = 0; (t0 + WIN) * fps <= M; t0 += STEP) {
      const i0 = Math.round(t0 * fps);
      let energy = 0;
      for (let i = 0; i < wl; i++) { seg[i] = o[i0 + i] * hw[i]; energy += seg[i]; }
      if (energy <= 1e-9) { wins.push({ t0, bpm: null }); continue; }
      const scores = new Float64Array(nCand);
      let mean = 0;
      for (let c = 0; c < nCand; c++) {
        const bpm = lo + c * step;
        let sc = 0;
        for (let h = 1; h <= 3; h++) {
          const th = 2 * Math.PI * h * bpm / 60 / fps, cs = Math.cos(th), sn = Math.sin(th);
          let cr = 1, ci = 0, re = 0, im = 0;
          for (let n = 0; n < wl; n++) {
            const v = seg[n];
            re += v * cr; im += v * ci;
            const t = cr * cs - ci * sn; ci = cr * sn + ci * cs; cr = t;
          }
          sc += [1, 0.6, 0.4][h - 1] * Math.sqrt(re * re + im * im);
        }
        scores[c] = sc; mean += sc;
      }
      mean /= nCand;
      let bi = 0, bw = -1;
      for (let c = 0; c < nCand; c++) {
        const w = scores[c] * Math.exp(-0.5 * (Math.log2((lo + c * step) / 125) / 0.55) ** 2);
        if (w > bw) { bw = w; bi = c; }
      }
      const conf = mean > 0 ? scores[bi] / mean : 0;
      let bpm = lo + bi * step;
      if (bi > 0 && bi < nCand - 1) {
        const a = scores[bi - 1], b = scores[bi], c = scores[bi + 1], den = a - 2 * b + c;
        if (den < 0) bpm += 0.5 * (a - c) / den * step;
      }
      wins.push({ t0, bpm: conf >= 4 ? bpm : null });
    }
    // окна с другим темпом: темп чётко определён и не совпадает с основным
    const other = wins.map((w) => w.bpm !== null && !sameTempo(w.bpm, mainBpm, 0.03));
    const out = [];
    let i = 0;
    while (i < wins.length) {
      if (!other[i]) { i++; continue; }
      let j = i;
      while (j + 1 < wins.length && other[j + 1] && sameTempo(wins[j + 1].bpm, wins[i].bpm, 0.03)) j++;
      if (j - i + 1 >= 3) {
        const vals = wins.slice(i, j + 1).map((w) => w.bpm).sort((a, b) => a - b);
        const start = i === 0 ? 0 : wins[i].t0 + WIN / 2 - STEP / 2;
        const end = j === wins.length - 1 ? mono.data.length / mono.sr : wins[j].t0 + WIN / 2 + STEP / 2;
        out.push({ start, end, bpm: vals[vals.length >> 1] });
      }
      i = j + 1;
    }
    return out;
  }

  /** Темп песни и участки с другим темпом. Основным считается темп, который звучит дольше всего. */
  function analyzeTempo(mono) {
    let main = detectBpm(mono);
    if (!(main.bpm > 0)) return { bpm: main, changes: [] };
    const total = mono.data.length / mono.sr;
    const refine = (seg) => {
      const sl = mono.data.subarray(Math.floor(seg.start * mono.sr), Math.floor(seg.end * mono.sr));
      const r = sl.length > mono.sr * 20 ? detectBpm({ data: sl, sr: mono.sr }) : null;
      return r && r.bpm > 0 && sameTempo(r.bpm, seg.bpm, 0.03) ? r.bpm : seg.bpm;
    };
    let changes = detectTempoChanges(mono, main.bpm);
    const otherTime = changes.reduce((s, c) => s + (c.end - c.start), 0);
    if (changes.length && otherTime > total * 0.5) {
      // другой темп звучит дольше: он и есть основной
      const big = changes.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
      const refined = refine(big);
      const sl = mono.data.subarray(Math.floor(big.start * mono.sr), Math.floor(big.end * mono.sr));
      const nb = sl.length > mono.sr * 20 ? detectBpm({ data: sl, sr: mono.sr }) : null;
      main = nb && nb.bpm > 0 ? nb : { bpm: refined, confidence: main.confidence, candidates: main.candidates };
      changes = detectTempoChanges(mono, main.bpm);
    }
    changes = changes.map((c) => ({ start: c.start, end: c.end, bpm: refine(c) }));
    return { bpm: main, changes };
  }

  // ---------- Подгонка ----------
  function semis(n, lang) {
    if (lang === 'en') return (n > 0 ? '+' : '') + n + (Math.abs(n) === 1 ? ' semitone' : ' semitones');
    const a = Math.abs(n) % 100, b = a % 10;
    const w = a > 10 && a < 20 ? 'полутонов' : b === 1 ? 'полутон' : b >= 2 && b <= 4 ? 'полутона' : 'полутонов';
    return (n > 0 ? '+' : '') + n + ' ' + w;
  }

  function keyName(k) { return NOTE_NAMES[k.tonic] + ' ' + k.mode; }

  function resolveKey(song, threshold, mustHaveKey) {
    const o = song.keyOverride || 'auto';
    if (o === 'none' && !mustHaveKey) return { keyless: true, source: 'manual' };
    if (o !== 'auto' && o !== 'none') {
      const [t, m] = o.split('-');
      return { keyless: false, tonic: +t, mode: m, source: 'manual' };
    }
    if (!song.key || (!mustHaveKey && song.key.score < threshold)) {
      return { keyless: true, source: 'auto', score: song.key ? song.key.score : 0 };
    }
    return { keyless: false, tonic: song.key.tonic, mode: song.key.mode, source: 'auto', score: song.key.score };
  }

  function effectiveBpm(song) {
    return song.bpmOverride || (song.bpm && song.bpm.bpm) || 0;
  }

  /**
   * GD Song подгоняется по тональности к обычной песне, обычная песня по темпу к GD Song.
   * Возвращает { error } или { semitones, tempoFactor, ... }. opts.lang: 'ru' (по умолчанию) или 'en'.
   */
  function plan(gd, reg, opts) {
    const { pitchLimit, keyThreshold } = opts;
    const en = opts.lang === 'en';
    const gk = resolveKey(gd, keyThreshold, true), rk = resolveKey(reg, keyThreshold, false);
    const gBpm = effectiveBpm(gd), rBpm = effectiveBpm(reg);
    if (!(gBpm > 0) || !(rBpm > 0)) {
      return { error: en ? 'Could not detect the BPM. Enter it manually.' : 'Не удалось определить BPM. Введите его вручную.' };
    }
    const warnings = [];
    let semitones = 0, keyNote, overLimit = false;

    if (gk.keyless || rk.keyless) {
      const who = en
        ? (gk.keyless && rk.keyless ? 'Neither song has a key' : gk.keyless ? 'The GD Song has no key' : 'The regular song has no key')
        : (gk.keyless && rk.keyless ? 'У обеих песен нет тональности' : gk.keyless ? 'У GD Song нет тональности' : 'У обычной песни нет тональности');
      keyNote = en ? who + ', leaving the pitch as is.' : who + ', питч не меняю.';
    } else {
      if (gk.mode !== rk.mode) {
        const mode = (m) => en ? m : (m === 'minor' ? 'минор' : 'мажор');
        return {
          error: en
            ? 'Error: the GD Song is ' + gk.mode + ' (' + keyName(gk) + ') but the regular song is ' + rk.mode + ' (' + keyName(rk) + '). These songs cannot be matched.'
            : 'Ошибка: у GD Song ' + mode(gk.mode) + ' (' + keyName(gk) + '), а у обычной песни ' + mode(rk.mode) + ' (' + keyName(rk) + '). Такие песни не подгоняются.',
        };
      }
      let d = (((rk.tonic - gk.tonic) % 12) + 12) % 12;
      if (d > 6) d -= 12;
      if (Math.abs(d) > pitchLimit) {
        overLimit = true;
        warnings.push(en
          ? 'Warning: the GD Song needs to move by ' + semis(d, 'en') + ', which is beyond your limit of ±' + pitchLimit + '. The sound may get distorted.'
          : 'Внимание: GD Song нужно сдвинуть на ' + semis(d) + ', это больше вашей границы ±' + pitchLimit + '. Звук может исказиться.');
      }
      semitones = d;
      keyNote = d === 0
        ? (en ? 'The key already matches (' + keyName(rk) + '), leaving the pitch as is.' : 'Тональность уже совпадает (' + keyName(rk) + '), питч не меняю.')
        : 'GD Song: ' + keyName(gk) + ' → ' + keyName(rk) + ' (' + semis(d, en ? 'en' : 'ru') + ').';
    }

    // Темп: 65 и 130 считаются одним и тем же, поэтому сравниваем с точностью до октавы.
    const k = Math.round(Math.log2(gBpm / rBpm));
    const target = gBpm / Math.pow(2, k);
    const tempoFactor = target / rBpm;
    let tempoNote;
    if (Math.abs(tempoFactor - 1) < 0.0005) {
      tempoNote = en
        ? 'The tempo already matches (' + +rBpm.toFixed(3) + ' and ' + +gBpm.toFixed(3) + ' BPM), leaving the regular song as is.'
        : 'Темп уже совпадает (' + +rBpm.toFixed(3) + ' и ' + +gBpm.toFixed(3) + ' BPM), обычную песню не меняю.';
    } else {
      const pct = Math.abs(tempoFactor - 1) * 100;
      tempoNote = en
        ? 'Regular song: ' + (+rBpm.toFixed(3)) + ' → ' + (+target.toFixed(3)) + ' BPM (' + (tempoFactor > 1 ? 'faster' : 'slower') + ' by ' + pct.toFixed(2) + '%, factor ' + tempoFactor.toFixed(5) + ').'
        : 'Обычная песня: ' + (+rBpm.toFixed(3)) + ' → ' + (+target.toFixed(3)) +
          ' BPM (' + (tempoFactor > 1 ? 'быстрее' : 'медленнее') + ' на ' + pct.toFixed(2) + '%, коэффициент ' + tempoFactor.toFixed(5) + ').';
      if (k !== 0) {
        tempoNote += en
          ? ' ' + (k > 0 ? 'The GD Song tempo is double' : 'The regular song tempo is double') + ', which counts as a match.'
          : ' ' + (k > 0 ? 'Темп GD Song вдвое' : 'Темп обычной песни вдвое') + ' выше, это считается совпадением.';
      }
      if (pct > 25) warnings.push(en ? 'The tempo changes a lot, so the sound quality may get worse.' : 'Темп меняется сильно, качество звука может ухудшиться.');
    }
    return { overLimit, semitones, tempoFactor: Math.abs(tempoFactor - 1) < 0.0005 ? 1 : tempoFactor, keyNote, tempoNote, warnings };
  }

  const api = { NOTE_NAMES, fft, toMono, detectKey, analyzeKey, detectBpm, detectTempoChanges, analyzeTempo, resolveKey, effectiveBpm, plan, keyName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MashaperAnalysis = api;
})(typeof self !== 'undefined' ? self : this);
