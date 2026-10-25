(function () {
  'use strict';
  const A = self.MashaperAnalysis, Dsp = self.MashaperDsp, Out = self.MashaperOut;
  const $ = (id) => document.getElementById(id);
  const t = (...a) => self.I18n.t(...a);
  const tick = () => new Promise((r) => setTimeout(r, 0));

  const SLOTS = ['gd', 'reg'];
  const label = (id) => (id === 'gd' ? 'GD Song' : t('label_reg'));
  const state = { gd: null, reg: null };
  const loadToken = { gd: 0, reg: 0 };
  let audioCtx = null;
  let busy = false;
  const objectUrls = [];

  // ---------- настройки ----------
  const pitchLimit = $('pitch-limit'), keyThreshold = $('key-threshold');
  function readStore(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function writeStore(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* без хранилища тоже работает */ } }
  const savedLimit = readStore('mashaper.pitchLimit'), savedThr = readStore('mashaper.keyThreshold2');
  if (savedLimit !== null && !isNaN(+savedLimit)) pitchLimit.value = savedLimit;
  if (savedThr !== null && !isNaN(+savedThr)) keyThreshold.value = savedThr;

  function plural(n) { return t('semis', n); }
  function renderSettings() {
    const n = +pitchLimit.value;
    $('pitch-limit-out').textContent = n === 0 ? t('no_shift') : '±' + n + ' ' + plural(n);
    $('key-threshold-out').textContent = (+keyThreshold.value).toFixed(2);
  }
  pitchLimit.addEventListener('input', () => { renderSettings(); writeStore('mashaper.pitchLimit', pitchLimit.value); });
  keyThreshold.addEventListener('input', () => {
    renderSettings(); writeStore('mashaper.keyThreshold2', keyThreshold.value);
    SLOTS.forEach(renderKeyInfo);
  });
  renderSettings();

  // ---------- смена языка ----------
  function relabelKeySelects() {
    SLOTS.forEach((s) => {
      const sel = $('key-' + s);
      for (const o of sel.options) {
        if (o.value === 'auto') o.textContent = t('auto');
        else if (o.value === 'none') o.textContent = t('none');
      }
    });
  }
  window.addEventListener('langchange', () => {
    renderSettings();
    relabelKeySelects();
    SLOTS.forEach((s) => {
      if (!state[s]) return;
      renderKeyInfo(s); renderBpmInfo(s); renderChanges(s); renderChips(s); renderBpmChips(s); renderBpmChanges(s);
    });
  });

  // ---------- выбор тональности ----------
  function fillKeySelect(sel, allowNone) {
    const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
    add('auto', t('auto'));
    if (allowNone) add('none', t('none'));
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
      renderBpmInfo(s); renderBpmChanges(s);
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
    const altText = song.key.ambiguousMode ? t('third_amb') : '';
    if (r.source === 'manual') {
      out.textContent = t('key_manual', A.keyName(song.key), score);
    } else if (r.keyless) {
      out.textContent = t('key_none', A.keyName(song.key), score, altText);
    } else {
      out.textContent = t('key_auto', A.keyName(r), score, altText);
    }
  }
  function renderChips(s) {
    const song = state[s];
    const box = $('chips-' + s);
    box.textContent = '';
    const cands = song && song.key && song.key.candidates ? song.key.candidates : [];
    if (!cands.length) { box.hidden = true; return; }
    const lab = document.createElement('small');
    lab.textContent = t('chips_key');
    lab.style.flexBasis = '100%';
    lab.style.color = 'var(--muted)';
    box.appendChild(lab);
    cands.forEach((k) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip';
      b.textContent = A.keyName(k) + ' ';
      if (k.tag) { const sm = document.createElement('small'); sm.textContent = t('tag_bass'); b.appendChild(sm); }
      b.addEventListener('click', () => {
        song.keyOverride = k.tonic + '-' + k.mode;
        $('key-' + s).value = song.keyOverride;
        renderKeyInfo(s);
      });
      box.appendChild(b);
    });
    box.hidden = false;
  }
  function renderBpmChips(s) {
    const song = state[s];
    const box = $('bpmchips-' + s);
    box.textContent = '';
    const cands = song && song.bpm && song.bpm.candidates ? song.bpm.candidates : [];
    if (!cands.length) { box.hidden = true; return; }
    const lab = document.createElement('small');
    lab.textContent = t('chips_bpm');
    lab.style.flexBasis = '100%';
    lab.style.color = 'var(--muted)';
    box.appendChild(lab);
    cands.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip';
      b.textContent = c.bpm.toFixed(1);
      b.addEventListener('click', () => {
        const input = $('bpm-' + s);
        input.value = c.bpm.toFixed(3);
        input.dispatchEvent(new Event('input'));
      });
      box.appendChild(b);
    });
    box.hidden = false;
  }
  function bpmChangeLines(song) {
    return (song.bpmChanges || []).map((c) => t('bpm_line', fmtTime(c.start), fmtTime(c.end), +c.bpm.toFixed(1)));
  }
  function renderBpmChanges(s) {
    const song = state[s];
    const el = $('bpmchanges-' + s);
    if (!song) { el.textContent = ''; return; }
    const lines = bpmChangeLines(song);
    el.className = 'key-changes' + (lines.length ? ' has-changes' : '');
    el.textContent = lines.length
      ? t('bpm_changes', lines.join('; '), +effectiveMainBpm(song).toFixed(3))
      : t('bpm_same');
  }
  function effectiveMainBpm(song) { return A.effectiveBpm(song); }
  function fmtTime(t) {
    return Math.floor(t / 60) + ':' + String(Math.round(t % 60) % 60).padStart(2, '0');
  }
  function changeLines(song) {
    return (song.keyChanges || []).map((c) => t('key_line', fmtTime(c.time), A.keyName(c.from), A.keyName(c.to)));
  }
  function renderChanges(s) {
    const song = state[s];
    const el = $('changes-' + s);
    if (!song) { el.textContent = ''; return; }
    const lines = changeLines(song);
    el.className = 'key-changes' + (lines.length ? ' has-changes' : '');
    el.textContent = lines.length
      ? t('key_changes', lines.join('; '), A.keyName(song.key))
      : t('key_same');
  }
  function renderBpmInfo(s) {
    const song = state[s];
    const out = $('bpminfo-' + s);
    if (!song) { out.textContent = ''; return; }
    const det = song.bpm && song.bpm.bpm ? song.bpm.bpm.toFixed(3) : null;
    out.textContent = song.bpmOverride
      ? t('bpm_manual', det)
      : det ? t('bpm_auto') : t('bpm_fail');
  }

  // ---------- загрузка и анализ ----------
  function setStatus(s, text, cls) {
    const el = $('status-' + s);
    el.textContent = text;
    el.className = 'status' + (cls ? ' ' + cls : '');
  }

  async function decode(file) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error(t('no_audio'));
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
    $('name-' + s).removeAttribute('data-i18n');
    $('name-' + s).textContent = file.name;
    $('name-' + s).parentElement.classList.add('has-file');
    hideResults();
    updateRunState();
    setStatus(s, t('reading'));
    try {
      const audio = await decode(file);
      if (token !== loadToken[s]) return;
      if (audio.channels[0].length < audio.sampleRate * 8) throw new Error(t('too_short'));
      setStatus(s, t('analyzing'));
      await tick(); await tick();
      const mono = A.toMono(audio.channels, audio.sampleRate);
      const ak = A.analyzeKey(mono);
      const key = ak.key;
      await tick();
      const at = A.analyzeTempo(mono);
      const bpm = at.bpm;
      if (token !== loadToken[s]) return;
      state[s] = { name: file.name, channels: audio.channels, sampleRate: audio.sampleRate, key, keyChanges: ak.changes, bpmChanges: at.changes, bpm, keyOverride: 'auto', bpmOverride: null };
      $('key-' + s).value = 'auto';
      $('bpm-' + s).value = bpm.bpm ? bpm.bpm.toFixed(3) : '';
      renderKeyInfo(s); renderBpmInfo(s); renderChanges(s); renderChips(s); renderBpmChips(s); renderBpmChanges(s);
      $('fields-' + s).hidden = false;
      const mins = Math.floor(audio.channels[0].length / audio.sampleRate / 60);
      const secs = Math.round(audio.channels[0].length / audio.sampleRate % 60);
      setStatus(s, t('done_len', mins + ':' + String(secs).padStart(2, '0')), 'ok');
    } catch (err) {
      if (token !== loadToken[s]) return;
      state[s] = null;
      setStatus(s, err && err.message && !/decode/i.test(err.message) ? err.message : t('decode_fail'), 'bad');
    }
    updateRunState();
  }

  let wasReady = false;
  function updateRunState() {
    const ready = !!(state.gd && state.reg && !busy);
    $('run').disabled = !ready;
    if (ready && !wasReady) window.dispatchEvent(new CustomEvent('mash', { detail: 'ready' }));
    wasReady = ready;
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
    dl.className = 'btn'; dl.href = url; dl.download = fileBase + '.wav'; dl.textContent = t('dl_wav');
    const mp3 = document.createElement('button');
    mp3.type = 'button'; mp3.className = 'btn'; mp3.textContent = t('dl_mp3');
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
        mp3.textContent = t('mp3_fail');
      }
      mp3.disabled = false;
    });
    btns.append(dl, mp3);
    card.append(h, p, audio, btns);
    $('outputs').appendChild(card);
  }

  $('run').addEventListener('click', () => {
    hideResults();
    const res = A.plan(state.gd, state.reg, { pitchLimit: +pitchLimit.value, keyThreshold: +keyThreshold.value, lang: self.I18n.lang });
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
    busy = true; updateRunState();
    $('result').hidden = false;
    const plan = $('plan');
    plan.textContent = '';
    [res.keyNote, res.tempoNote].concat(res.warnings.map((w) => w)).forEach((t, i) => {
      const li = document.createElement('li');
      li.textContent = t;
      if (res.warnings.includes(t)) li.className = 'warn';
      plan.appendChild(li);
    });
    [['gd', gd], ['reg', reg]].forEach(([id, song]) => {
      const lines = changeLines(song);
      if (!lines.length) return;
      const li = document.createElement('li');
      li.className = 'warn';
      li.textContent = t('key_changes_plan', label(id), lines.join('; '), A.keyName(song.key));
      plan.appendChild(li);
    });
    [['gd', gd], ['reg', reg]].forEach(([id, song]) => {
      const lines = bpmChangeLines(song);
      if (!lines.length) return;
      const li = document.createElement('li');
      li.className = 'warn';
      li.textContent = t('bpm_changes_plan', label(id), lines.join('; '), +A.effectiveBpm(song).toFixed(3));
      plan.appendChild(li);
    });

    try {
      let gdOut = gd.channels, regOut = reg.channels;
      if (res.semitones !== 0) {
        setProgress(t('prog_pitch'), 0);
        gdOut = await Dsp.pitchShift(gd.channels, res.semitones, (f) => setProgress(t('prog_pitch'), f));
      }
      if (res.tempoFactor !== 1) {
        setProgress(t('prog_tempo'), 0);
        regOut = await Dsp.timeStretch(regOut, res.tempoFactor, (f) => setProgress(t('prog_tempo'), f));
      }
      setProgress(t('prog_files'), 1);
      await tick();
      const sign = res.semitones > 0 ? '+' : '';
      addOutput('GD Song',
        res.semitones === 0 ? t('out_pitch_none') : t('out_pitch', sign, res.semitones, plural(res.semitones)),
        baseName(gd.name) + (res.semitones === 0 ? '_original' : '_' + sign + res.semitones + 'st'),
        gdOut, gd.sampleRate);
      const target = A.effectiveBpm(reg) * res.tempoFactor;
      addOutput(t('label_reg'),
        res.tempoFactor === 1 ? t('out_tempo_none') : t('out_tempo', +target.toFixed(3)),
        baseName(reg.name) + (res.tempoFactor === 1 ? '_original' : '_' + Math.round(target) + 'bpm'),
        regOut, reg.sampleRate);
      $('progress').hidden = true;
      window.dispatchEvent(new CustomEvent('mash', { detail: 'done' }));
    } catch (err) {
      $('progress').hidden = true;
      showError(t('process_fail', err && err.message ? err.message : t('unknown_err')));
      busy = false; updateRunState();
      return;
    }
    busy = false; updateRunState();
  }
})();
