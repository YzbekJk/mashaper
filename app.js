(function () {
  'use strict';
  const A = self.MashaperAnalysis, Dsp = self.MashaperDsp, Out = self.MashaperOut;
  const $ = (id) => document.getElementById(id);
  const tick = () => new Promise((r) => setTimeout(r, 0));

  const SLOTS = ['gd', 'reg'];
  const LABEL = { gd: 'GD Song', reg: 'Обычная песня' };
  const state = { gd: null, reg: null };
  const loadToken = { gd: 0, reg: 0 };
  let audioCtx = null;
  let busy = false;
  const objectUrls = [];

  // ---------- настройки ----------
  const pitchLimit = $('pitch-limit'), keyThreshold = $('key-threshold');
  function readStore(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function writeStore(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* без хранилища тоже работает */ } }
  const savedLimit = readStore('mashaper.pitchLimit'), savedThr = readStore('mashaper.keyThreshold');
  if (savedLimit !== null && !isNaN(+savedLimit)) pitchLimit.value = savedLimit;
  if (savedThr !== null && !isNaN(+savedThr)) keyThreshold.value = savedThr;

  function plural(n) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return 'полутонов';
    if (b === 1) return 'полутон';
    if (b >= 2 && b <= 4) return 'полутона';
    return 'полутонов';
  }
  function renderSettings() {
    const n = +pitchLimit.value;
    $('pitch-limit-out').textContent = n === 0 ? 'без сдвига' : '±' + n + ' ' + plural(n);
    $('key-threshold-out').textContent = (+keyThreshold.value).toFixed(2);
  }
  pitchLimit.addEventListener('input', () => { renderSettings(); writeStore('mashaper.pitchLimit', pitchLimit.value); });
  keyThreshold.addEventListener('input', () => {
    renderSettings(); writeStore('mashaper.keyThreshold', keyThreshold.value);
    SLOTS.forEach(renderKeyInfo);
  });
  renderSettings();

  // ---------- выбор тональности ----------
  function fillKeySelect(sel, allowNone) {
    const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
    add('auto', 'Авто');
    if (allowNone) add('none', 'Без тональности');
    for (const mode of ['major', 'minor']) {
      for (let t = 0; t < 12; t++) add(t + '-' + mode, A.NOTE_NAMES[t] + ' ' + mode);
    }
  }
  SLOTS.forEach((s) => {
    fillKeySelect($('key-' + s), s === 'reg');
    $('key-' + s).addEventListener('change', (e) => {
      if (!state[s]) return;
      state[s].keyOverride = e.target.value;
      renderKeyInfo(s);
    });
    $('bpm-' + s).addEventListener('input', (e) => {
      if (!state[s]) return;
      const v = parseFloat(e.target.value);
      state[s].bpmOverride = v > 0 ? v : null;
      renderBpmInfo(s);
      updateRunState();
    });
    $('file-' + s).addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) loadSong(s, f);
    });
  });

  function renderKeyInfo(s) {
    const song = state[s];
    const out = $('keyinfo-' + s);
    if (!song || !song.key) { out.textContent = ''; return; }
    const r = A.resolveKey(song, +keyThreshold.value, s === 'gd');
    const score = song.key.score.toFixed(2);
    const alts = (song.key.alternatives || []).map((k) => A.keyName(k) + ' ' + k.score.toFixed(2)).join(', ');
    const altText = alts ? ' Похожие варианты: ' + alts + '.' : '';
    if (r.source === 'manual') {
      out.textContent = 'Задано вручную. Автоопределение: ' + A.keyName(song.key) + ' (' + score + ').';
    } else if (r.keyless) {
      out.textContent = 'Без тональности. Лучшее совпадение ' + A.keyName(song.key) + ' всего ' + score + '.' + altText;
    } else {
      out.textContent = 'Определено: ' + A.keyName(r) + ' (уверенность ' + score + ').' + altText;
    }
  }
  function renderBpmInfo(s) {
    const song = state[s];
    const out = $('bpminfo-' + s);
    if (!song) { out.textContent = ''; return; }
    const det = song.bpm && song.bpm.bpm ? song.bpm.bpm.toFixed(3) : null;
    out.textContent = song.bpmOverride
      ? 'Задано вручную' + (det ? '. Автоопределение: ' + det : '')
      : det ? 'Определено автоматически' : 'Не удалось определить, введите вручную';
  }

  // ---------- загрузка и анализ ----------
  function setStatus(s, text, cls) {
    const el = $('status-' + s);
    el.textContent = text;
    el.className = 'status' + (cls ? ' ' + cls : '');
  }

  async function decode(file) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Браузер не поддерживает обработку звука.');
    if (!audioCtx) audioCtx = new AC();
    const data = await file.arrayBuffer();
    const buf = await new Promise((resolve, reject) => {
      const p = audioCtx.decodeAudioData(data, resolve, reject);
      if (p && p.catch) p.catch(reject);
    });
    const channels = [];
    for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) channels.push(new Float32Array(buf.getChannelData(c)));
    return { channels, sampleRate: buf.sampleRate };
  }

  async function loadSong(s, file) {
    const token = ++loadToken[s];
    state[s] = null;
    $('fields-' + s).hidden = true;
    if (s === 'reg') $('strip-wrap').hidden = true;
    $('name-' + s).textContent = file.name;
    $('name-' + s).parentElement.classList.add('has-file');
    hideResults();
    updateRunState();
    setStatus(s, 'Читаю файл…');
    try {
      const audio = await decode(file);
      if (token !== loadToken[s]) return;
      if (audio.channels[0].length < audio.sampleRate * 8) throw new Error('Песня слишком короткая, нужно хотя бы 8 секунд.');
      setStatus(s, 'Определяю тональность и BPM…');
      await tick(); await tick();
      const mono = A.toMono(audio.channels, audio.sampleRate);
      const key = A.detectKey(mono);
      await tick();
      const bpm = A.detectBpm(mono);
      if (token !== loadToken[s]) return;
      state[s] = { name: file.name, channels: audio.channels, sampleRate: audio.sampleRate, key, bpm, keyOverride: 'auto', bpmOverride: null };
      $('key-' + s).value = 'auto';
      $('bpm-' + s).value = bpm.bpm ? bpm.bpm.toFixed(3) : '';
      renderKeyInfo(s); renderBpmInfo(s);
      $('fields-' + s).hidden = false;
      if (s === 'reg') { $('strip-wrap').hidden = false; }
      const mins = Math.floor(audio.channels[0].length / audio.sampleRate / 60);
      const secs = Math.round(audio.channels[0].length / audio.sampleRate % 60);
      setStatus(s, 'Готово, длина ' + mins + ':' + String(secs).padStart(2, '0'), 'ok');
    } catch (err) {
      if (token !== loadToken[s]) return;
      state[s] = null;
      setStatus(s, err && err.message && !/decode/i.test(err.message) ? err.message : 'Не удалось прочитать файл. Попробуйте mp3, ogg или wav.', 'bad');
    }
    updateRunState();
  }

  function updateRunState() {
    const ready = state.gd && state.reg && !busy;
    $('run').disabled = !ready;
  }

  // ---------- результат ----------
  function hideResults() {
    $('error').hidden = true;
    $('confirm').hidden = true;
    $('result').hidden = true;
    $('outputs').textContent = '';
    objectUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  }
  function showError(msg) {
    const el = $('error');
    el.textContent = msg;
    el.hidden = false;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function setProgress(label, frac) {
    $('progress').hidden = false;
    $('progress-label').textContent = label;
    $('progress-bar').value = frac;
  }

  function baseName(n) { return n.replace(/\.[^.]+$/, ''); }

  function addOutput(title, note, fileBase, chs, sr) {
    const wav = Out.encodeWav(chs, sr);
    const url = URL.createObjectURL(wav);
    objectUrls.push(url);
    const card = document.createElement('div');
    card.className = 'out';
    const h = document.createElement('h3'); h.textContent = title;
    const p = document.createElement('p'); p.textContent = note;
    const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'metadata'; audio.src = url;
    const btns = document.createElement('div'); btns.className = 'btns';
    const dl = document.createElement('a');
    dl.className = 'btn'; dl.href = url; dl.download = fileBase + '.wav'; dl.textContent = 'Скачать WAV';
    const mp3 = document.createElement('button');
    mp3.type = 'button'; mp3.className = 'btn'; mp3.textContent = 'Скачать MP3';
    mp3.addEventListener('click', async () => {
      mp3.disabled = true;
      const old = mp3.textContent;
      try {
        const blob = await Out.encodeMp3(chs, sr, (f) => { mp3.textContent = 'MP3 ' + Math.round(f * 100) + '%'; });
        const u = URL.createObjectURL(blob); objectUrls.push(u);
        const a = document.createElement('a'); a.href = u; a.download = fileBase + '.mp3';
        document.body.appendChild(a); a.click(); a.remove();
        mp3.textContent = old;
      } catch (e) {
        mp3.textContent = 'MP3 недоступен, скачайте WAV';
      }
      mp3.disabled = false;
    });
    btns.append(dl, mp3);
    card.append(h, p, audio, btns);
    $('outputs').appendChild(card);
  }

  $('run').addEventListener('click', () => {
    hideResults();
    const res = A.plan(state.gd, state.reg, { pitchLimit: +pitchLimit.value, keyThreshold: +keyThreshold.value });
    if (res.error) { showError(res.error); return; }
    if (res.overLimit) {
      $('confirm-text').textContent = res.warnings[0];
      $('confirm').hidden = false;
      $('confirm-yes').onclick = () => { $('confirm').hidden = true; process(res); };
      $('confirm-no').onclick = () => { $('confirm').hidden = true; };
      $('confirm').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    process(res);
  });

  async function process(res) {
    const gd = state.gd, reg = state.reg;
    const strip = $('strip-reg').checked;
    let stripSkipped = false;
    busy = true; updateRunState();
    $('result').hidden = false;
    const plan = $('plan');
    plan.textContent = '';
    [res.keyNote, res.tempoNote].concat(strip ? ['Обычная песня: оставляю только акапеллу.'] : []).concat(res.warnings.map((w) => w)).forEach((t, i) => {
      const li = document.createElement('li');
      li.textContent = t;
      if (res.warnings.includes(t)) li.className = 'warn';
      plan.appendChild(li);
    });

    try {
      let gdOut = gd.channels, regOut = reg.channels;
      if (res.semitones !== 0) {
        setProgress('Сдвигаю питч GD Song…', 0);
        gdOut = await Dsp.pitchShift(gd.channels, res.semitones, (f) => setProgress('Сдвигаю питч GD Song…', f));
      }
      if (strip) {
        setProgress('Выделяю акапеллу…', 0);
        try {
          regOut = (await Dsp.removeInstrumental(reg.channels, reg.sampleRate, (f) => setProgress('Выделяю акапеллу…', f))).channels;
        } catch (err) {
          if (!err.mono) {
            $('progress').hidden = true;
            $('result').hidden = true;
            showError('Не удалось убрать инструментал. ' + err.message);
            busy = false; updateRunState();
            return;
          }
          // Моно или почти моно: считаем, что это уже акапелла, и оставляем как есть
          stripSkipped = true;
        }
      }
      if (res.tempoFactor !== 1) {
        setProgress('Меняю темп обычной песни…', 0);
        regOut = await Dsp.timeStretch(regOut, res.tempoFactor, (f) => setProgress('Меняю темп обычной песни…', f));
      }
      setProgress('Готовлю файлы…', 1);
      await tick();
      const sign = res.semitones > 0 ? '+' : '';
      addOutput('GD Song',
        res.semitones === 0 ? 'Питч не менялся.' : 'Питч ' + sign + res.semitones + ' ' + plural(res.semitones) + ', темп не менялся.',
        baseName(gd.name) + (res.semitones === 0 ? '_original' : '_' + sign + res.semitones + 'st'),
        gdOut, gd.sampleRate);
      const target = A.effectiveBpm(reg) * res.tempoFactor;
      addOutput('Обычная песня',
        (res.tempoFactor === 1 ? 'Темп не менялся.' : 'Темп изменён до ' + (+target.toFixed(3)) + ' BPM, питч не менялся.') + (strip ? (stripSkipped ? ' Песня моно, считаю её акапеллой и не меняю.' : ' Остался только вокал.') : ''),
        baseName(reg.name) + (strip && !stripSkipped ? '_acapella' : '') + (res.tempoFactor === 1 ? (strip && !stripSkipped ? '' : '_original') : '_' + Math.round(target) + 'bpm'),
        regOut, reg.sampleRate);
      $('progress').hidden = true;
    } catch (err) {
      $('progress').hidden = true;
      showError('Не удалось обработать песни: ' + (err && err.message ? err.message : 'неизвестная ошибка') + '. Возможно, не хватило памяти, попробуйте песни покороче.');
    }
    busy = false; updateRunState();
  }
})();
