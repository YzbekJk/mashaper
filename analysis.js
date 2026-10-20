/* Мэшапер: анализ тональности и BPM, план подгонки. Работает и в браузере, и в Node. */
(function (root) {
  'use strict';

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

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

  function chromaFromSpectrum(spec, sr, N, tuning) {
    const chroma = new Float64Array(12);
    const kmin = Math.ceil(70 * N / sr), kmax = Math.min(N / 2 - 1, Math.floor(2100 * N / sr));
    for (let k = kmin; k <= kmax; k++) {
      const f = k * sr / N;
      const midi = 69 + 12 * Math.log2(f / 440) - tuning;
      const r = Math.round(midi);
      const dev = midi - r;
      const w = Math.cos(Math.PI * dev) ** 2;
      chroma[((r % 12) + 12) % 12] += w * spec[k];
    }
    return chroma;
  }

  /** Определяет тональность по средней хромаграмме (профили Краусса-Кесслера). */
  function detectKey(mono) {
    const { data, sr } = mono;
    const N = 8192, hop = N / 2;
    const total = Math.floor((data.length - N) / hop) + 1;
    if (total < 4) return { tonic: 0, mode: 'major', score: 0, tuning: 0 };
    const maxFrames = 500;
    const idxs = [];
    for (let i = 0; i < Math.min(total, maxFrames); i++) {
      idxs.push(Math.floor(i * total / Math.min(total, maxFrames)));
    }
    const win = hann(N);
    const re = new Float64Array(N), im = new Float64Array(N);
    const spec = new Float64Array(N / 2);
    const energies = [];
    const frames = [];
    for (const f of idxs) {
      let e = 0;
      for (let i = 0; i < N; i++) {
        const v = data[f * hop + i];
        re[i] = v * win[i]; im[i] = 0; e += v * v;
      }
      fft(re, im);
      const mag = new Float32Array(N / 2);
      for (let k = 0; k < N / 2; k++) mag[k] = Math.sqrt(Math.sqrt(re[k] * re[k] + im[k] * im[k]));
      frames.push(mag); energies.push(e);
    }
    const sorted = energies.slice().sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    for (let j = 0; j < frames.length; j++) {
      if (energies[j] < med * 0.05 || energies[j] <= 1e-9) continue;
      const mag = frames[j];
      let sum = 0;
      for (let k = 0; k < N / 2; k++) sum += mag[k];
      if (sum <= 0) continue;
      for (let k = 0; k < N / 2; k++) spec[k] += mag[k] / sum;
    }

    let best = { score: -2 };
    for (const tuning of [-0.3, -0.15, 0, 0.15, 0.3]) {
      const chroma = chromaFromSpectrum(spec, sr, N, tuning);
      for (let tonic = 0; tonic < 12; tonic++) {
        for (const mode of ['major', 'minor']) {
          const prof = mode === 'major' ? KK_MAJOR : KK_MINOR;
          const rotated = new Array(12);
          for (let i = 0; i < 12; i++) rotated[i] = prof[((i - tonic) % 12 + 12) % 12];
          const score = pearson(Array.from(chroma), rotated);
          if (score > best.score) best = { tonic, mode, score, tuning };
        }
      }
    }
    return best;
  }

  // ---------- BPM ----------
  function onsetEnvelope(mono) {
    const { data, sr } = mono;
    const N = 1024, hop = 256;
    let peak = 0;
    const seg = Math.min(data.length, Math.floor(200 * sr));
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
    let bi = 0, mean = 0;
    for (let c = 0; c < nCand; c++) { mean += scores[c]; if (scores[c] > scores[bi]) bi = c; }
    mean /= nCand;
    let bpm = lo + bi * step;
    if (bi > 0 && bi < nCand - 1) {
      const a = scores[bi - 1], b = scores[bi], c = scores[bi + 1];
      const den = a - 2 * b + c;
      if (den < 0) bpm += 0.5 * (a - c) / den * step;
    }
    return { bpm, confidence: mean > 0 ? scores[bi] / mean : 0 };
  }

  // ---------- Подгонка ----------
  function semis(n) {
    const a = Math.abs(n) % 100, b = a % 10;
    const w = a > 10 && a < 20 ? 'полутонов' : b === 1 ? 'полутон' : b >= 2 && b <= 4 ? 'полутона' : 'полутонов';
    return (n > 0 ? '+' : '') + n + ' ' + w;
  }

  function keyName(k) { return NOTE_NAMES[k.tonic] + ' ' + k.mode; }

  function resolveKey(song, threshold) {
    const o = song.keyOverride || 'auto';
    if (o === 'none') return { keyless: true, source: 'manual' };
    if (o !== 'auto') {
      const [t, m] = o.split('-');
      return { keyless: false, tonic: +t, mode: m, source: 'manual' };
    }
    if (!song.key || song.key.score < threshold) {
      return { keyless: true, source: 'auto', score: song.key ? song.key.score : 0 };
    }
    return { keyless: false, tonic: song.key.tonic, mode: song.key.mode, source: 'auto', score: song.key.score };
  }

  function effectiveBpm(song) {
    return song.bpmOverride || (song.bpm && song.bpm.bpm) || 0;
  }

  /**
   * GD Song подгоняется по тональности к обычной песне, обычная песня по темпу к GD Song.
   * Возвращает { error } или { semitones, tempoFactor, ... }.
   */
  function plan(gd, reg, opts) {
    const { pitchLimit, keyThreshold } = opts;
    const gk = resolveKey(gd, keyThreshold), rk = resolveKey(reg, keyThreshold);
    const gBpm = effectiveBpm(gd), rBpm = effectiveBpm(reg);
    if (!(gBpm > 0) || !(rBpm > 0)) {
      return { error: 'Не удалось определить BPM. Введите его вручную.' };
    }
    const warnings = [];
    let semitones = 0, keyNote;

    if (gk.keyless || rk.keyless) {
      const who = gk.keyless && rk.keyless ? 'У обеих песен нет тональности'
        : gk.keyless ? 'У GD Song нет тональности' : 'У обычной песни нет тональности';
      keyNote = who + ', питч не меняю.';
    } else {
      if (gk.mode !== rk.mode) {
        return {
          error: 'Ошибка: у GD Song ' + (gk.mode === 'minor' ? 'минор' : 'мажор') + ' (' + keyName(gk) +
            '), а у обычной песни ' + (rk.mode === 'minor' ? 'минор' : 'мажор') + ' (' + keyName(rk) +
            '). Такие песни не подгоняются.',
        };
      }
      let d = (((rk.tonic - gk.tonic) % 12) + 12) % 12;
      if (d > 6) d -= 12;
      if (Math.abs(d) > pitchLimit) {
        return {
          error: 'Ошибка: GD Song (' + keyName(gk) + ') нужно сдвинуть на ' + semis(d) +
            ', чтобы попасть в ' + keyName(rk) + ', а лимит питча ±' + pitchLimit +
            '. Увеличьте лимит в настройках или выберите другую песню.',
        };
      }
      semitones = d;
      keyNote = d === 0
        ? 'Тональность уже совпадает (' + keyName(rk) + '), питч не меняю.'
        : 'GD Song: ' + keyName(gk) + ' → ' + keyName(rk) + ' (' + semis(d) + ').';
    }

    // Темп: 65 и 130 считаются одним и тем же, поэтому сравниваем с точностью до октавы.
    const k = Math.round(Math.log2(gBpm / rBpm));
    const target = gBpm / Math.pow(2, k);
    const tempoFactor = target / rBpm;
    let tempoNote;
    if (Math.abs(tempoFactor - 1) < 0.0005) {
      tempoNote = 'Темп уже совпадает (' + Math.round(rBpm * 10) / 10 + ' и ' + Math.round(gBpm * 10) / 10 + ' BPM), обычную песню не меняю.';
    } else {
      const pct = Math.abs(tempoFactor - 1) * 100;
      tempoNote = 'Обычная песня: ' + (Math.round(rBpm * 10) / 10) + ' → ' + (Math.round(target * 10) / 10) +
        ' BPM (' + (tempoFactor > 1 ? 'быстрее' : 'медленнее') + ' на ' + pct.toFixed(1) + '%).';
      if (k !== 0) tempoNote += ' ' + (k > 0 ? 'Темп GD Song вдвое' : 'Темп обычной песни вдвое') + ' выше, это считается совпадением.';
      if (pct > 25) warnings.push('Темп меняется сильно, качество звука может ухудшиться.');
    }
    return { semitones, tempoFactor: Math.abs(tempoFactor - 1) < 0.0005 ? 1 : tempoFactor, keyNote, tempoNote, warnings };
  }

  const api = { NOTE_NAMES, fft, toMono, detectKey, detectBpm, resolveKey, effectiveBpm, plan, keyName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MashaperAnalysis = api;
})(typeof self !== 'undefined' ? self : this);
