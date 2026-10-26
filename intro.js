/* Мэшапер: вступление (язык, вопрос, обучение) и жизнь Мэша на странице. */
(function () {
  'use strict';
  const I = self.I18n, M = self.Mascot;
  const $ = (id) => document.getElementById(id);
  const t = (...a) => I.t(...a);
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  I.apply();
  function renderVersion() {
    const V = self.MASHAPER_VERSION;
    $('version').textContent = V ? t('version') + ' ' + V.v + ' · ' + V.date.split('-').reverse().join('.') : '';
  }
  renderVersion();
  window.addEventListener('langchange', renderVersion);
  function markLang() {
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === I.lang)));
  }
  document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => I.set(b.dataset.lang)));
  markLang();
  window.addEventListener('langchange', markLang);

  // ---------- звук (только по нажатию кнопок) ----------
  let ac = null, grooveFn = null;
  function audio() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ac = new C();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(semi, at, dur, vol) {
    const a = audio();
    if (!a) return;
    if (grooveFn) grooveFn(700);
    const t0 = a.currentTime + (at || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'triangle';
    o.frequency.value = 261.63 * Math.pow(2, semi / 12);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol || 0.18, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function clickSound() {
    const a = audio();
    if (!a) return;
    if (grooveFn) grooveFn(350);
    const t0 = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'square'; o.frequency.value = 1200;
    g.gain.setValueAtTime(0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + 0.06);
  }

  // ---------- пианино ----------
  const WHITE = [0, 2, 4, 5, 7, 9, 11, 12];
  const NAMES = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B', 12: 'C' };
  const BLACK = { 1: 12.5, 3: 25, 6: 50, 8: 62.5, 10: 75 };
  function piano() {
    const root = h('div', 'piano');
    root.setAttribute('aria-hidden', 'true');
    const keys = {};
    WHITE.forEach((s) => {
      const k = h('div', 'key white');
      k.appendChild(h('span', 'kn', NAMES[s]));
      root.appendChild(k); keys[s] = k;
    });
    Object.keys(BLACK).forEach((s) => {
      const k = h('div', 'key black');
      k.style.left = (BLACK[s] - 4) + '%';
      root.appendChild(k); keys[s] = k;
    });
    return {
      root, keys,
      clear() {
        Object.keys(keys).forEach((s) => { keys[s].classList.remove('on', 'low'); keys[s].style.transitionDelay = '0ms'; });
      },
    };
  }

  // ---------- демо ----------
  // Каждое демо рисует себя в box и возвращает функцию очистки.
  function demoScale(box) {
    const p = piano();
    p.keys[0].classList.add('tonic');
    const cap = h('p', 'demo-cap', 'C major: C D E F G A B C');
    const btn = h('button', 'btn small', t('listen'));
    btn.type = 'button';
    box.appendChild(p.root); box.appendChild(cap); box.appendChild(btn);
    const seq = [0, 2, 4, 5, 7, 9, 11, 12];
    let i = 0, timer = null, sound = false;
    function step() {
      if (i === 0) p.clear();
      if (i < seq.length) {
        p.keys[seq[i]].classList.add('on');
        if (sound) tone(seq[i], 0, 0.5);
        i++;
        timer = setTimeout(step, 520);
      } else {
        i = 0; sound = false;
        timer = setTimeout(step, 1700);
      }
    }
    if (reduce) { seq.forEach((s) => p.keys[s].classList.add('on')); } else step();
    btn.addEventListener('click', () => {
      clearTimeout(timer); i = 0; sound = true; step();
    });
    return () => clearTimeout(timer);
  }

  function demoMode(box) {
    const MAJ = [0, 2, 4, 5, 7, 9, 11, 12], MIN = [0, 2, 3, 5, 7, 8, 10, 12];
    const p = piano();
    p.keys[0].classList.add('tonic');
    const seg = h('div', 'seg');
    seg.setAttribute('role', 'group');
    const bMaj = h('button', '', t('major')), bMin = h('button', '', t('minor'));
    bMaj.type = 'button'; bMin.type = 'button';
    seg.appendChild(bMaj); seg.appendChild(bMin);
    const cap = h('p', 'demo-cap');
    const btn = h('button', 'btn small', t('listen'));
    btn.type = 'button';
    box.appendChild(seg); box.appendChild(p.root); box.appendChild(cap); box.appendChild(btn);
    let mode = 'major', timer = null;
    function show(m) {
      mode = m;
      p.clear();
      (m === 'major' ? MAJ : MIN).forEach((s, idx) => {
        const k = p.keys[s];
        k.style.transitionDelay = (reduce ? 0 : idx * 45) + 'ms';
        k.classList.add('on');
        if (m === 'minor' && (s === 3 || s === 8 || s === 10)) k.classList.add('low');
      });
      bMaj.setAttribute('aria-pressed', String(m === 'major'));
      bMin.setAttribute('aria-pressed', String(m === 'minor'));
      cap.textContent = m === 'major' ? 'C ' + t('major').toLowerCase() + ': C D E F G A B C' : 'C ' + t('minor').toLowerCase() + ': C D E♭ F G A♭ B♭ C';
    }
    function stopAuto() { clearInterval(timer); timer = null; }
    bMaj.addEventListener('click', () => { stopAuto(); show('major'); });
    bMin.addEventListener('click', () => { stopAuto(); show('minor'); });
    btn.addEventListener('click', () => {
      (mode === 'major' ? MAJ : MIN).forEach((s, idx) => tone(s, idx * 0.35, 0.5));
    });
    show('major');
    if (!reduce) timer = setInterval(() => show(mode === 'major' ? 'minor' : 'major'), 3800);
    return stopAuto;
  }

  function demoShift(box) {
    const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    const FROM = 2, TO = 5;
    const ladder = h('div', 'ladder');
    ladder.setAttribute('aria-hidden', 'true');
    const cells = NOTES.map((n, i) => {
      const c = h('div', 'dotcell');
      c.appendChild(document.createElement('i'));
      c.appendChild(h('span', '', n));
      if (i === TO) c.classList.add('target');
      ladder.appendChild(c);
      return c;
    });
    const legend = h('div', 'legend');
    const l1 = h('span', 'lg-here', t('shift_gd') + ': D minor');
    const l2 = h('span', 'lg-target', t('shift_reg') + ': F minor');
    legend.appendChild(l1); legend.appendChild(l2);
    const cap = h('p', 'demo-cap', '');
    cap.setAttribute('aria-live', 'polite');
    const btn = h('button', 'btn small', t('listen'));
    btn.type = 'button';
    box.appendChild(legend); box.appendChild(ladder); box.appendChild(cap); box.appendChild(btn);
    let pos = FROM, timer = null, sound = false;
    function draw() {
      cells.forEach((c, i) => {
        c.classList.toggle('here', i === pos);
        c.classList.toggle('trail', i > FROM && i < pos);
      });
      cap.textContent = pos === FROM ? '' : pos === TO ? t('shift_note', TO - FROM) : '+' + (pos - FROM);
    }
    function step() {
      if (pos < TO) {
        pos++;
        if (sound) tone(pos, 0, 0.4);
        timer = setTimeout(step, 650);
      } else {
        sound = false;
        timer = setTimeout(() => { pos = FROM; draw(); timer = setTimeout(step, 900); }, 2200);
      }
      draw();
    }
    draw();
    if (reduce) { pos = TO; draw(); } else timer = setTimeout(step, 900);
    btn.addEventListener('click', () => {
      clearTimeout(timer); pos = FROM; sound = true; draw();
      tone(FROM, 0, 0.4);
      timer = setTimeout(step, 650);
    });
    return () => clearTimeout(timer);
  }

  function demoTap(box) {
    const METRO = 100;
    const circle = h('div', 'pulse');
    circle.style.animationDuration = (60 / METRO) + 's';
    circle.setAttribute('aria-hidden', 'true');
    const hint = h('p', 'demo-cap', t('tap_hint'));
    const btn = h('button', 'primary tapbtn', t('tap'));
    btn.type = 'button';
    const res = h('p', 'tap-res', t('tap_metro', METRO));
    res.setAttribute('aria-live', 'polite');
    const clicks = h('button', 'btn small', t('clicks_off'));
    clicks.type = 'button';
    clicks.setAttribute('aria-pressed', 'false');
    const row = h('div', 'tap-row');
    row.appendChild(circle);
    const col = h('div', 'tap-col');
    col.appendChild(hint); col.appendChild(btn); col.appendChild(res); col.appendChild(clicks);
    row.appendChild(col);
    box.appendChild(row);
    let taps = [], metro = null;
    btn.addEventListener('click', () => {
      const now = performance.now();
      if (taps.length && now - taps[taps.length - 1] > 2200) taps = [];
      taps.push(now);
      if (taps.length > 8) taps.shift();
      if (taps.length >= 2) {
        const bpm = 60000 * (taps.length - 1) / (now - taps[0]);
        res.textContent = t('tap_result', Math.round(bpm)) + ' · ' + t('tap_metro', METRO);
      }
    });
    clicks.addEventListener('click', () => {
      const on = !metro;
      clicks.setAttribute('aria-pressed', String(on));
      clicks.textContent = on ? t('clicks_on') : t('clicks_off');
      clearInterval(metro); metro = null;
      circle.style.animation = 'none';
      void circle.offsetWidth;
      circle.style.animation = '';
      circle.style.animationDuration = (60 / METRO) + 's';
      if (on) { clickSound(); metro = setInterval(clickSound, 60000 / METRO); }
    });
    return () => clearInterval(metro);
  }

  function demoBeats(box) {
    const N = 11, GD = 8, BEFORE = 9.1;
    const lanes = h('div', 'lanes');
    lanes.setAttribute('aria-hidden', 'true');
    function lane(label, cls) {
      lanes.appendChild(h('div', 'lane-label', label));
      const l = h('div', 'lane');
      const ticks = [];
      for (let i = 0; i < N; i++) {
        const tk = h('span', 'tick ' + cls);
        tk.style.left = (i * GD) + '%';
        l.appendChild(tk); ticks.push(tk);
      }
      lanes.appendChild(l);
      return ticks;
    }
    const gdTicks = lane(t('beats_gd') + ' · 140 BPM', 'gd');
    const regTicks = lane(t('beats_reg') + ' · 138 → 140 BPM', 'reg');
    void gdTicks;
    for (let i = 0; i < N; i++) {
      const g = h('span', 'guide');
      g.style.left = (i * GD) + '%';
      lanes.appendChild(g);
    }
    const cap = h('p', 'demo-cap');
    cap.setAttribute('aria-live', 'polite');
    const note = h('p', 'hint', t('beats_note'));
    box.appendChild(lanes); box.appendChild(cap); box.appendChild(note);
    let after = false, timer = null;
    function show(a) {
      after = a;
      lanes.classList.toggle('after', a);
      regTicks.forEach((tk, i) => { tk.style.left = (i * (a ? GD : BEFORE)) + '%'; });
      cap.textContent = a ? t('beats_after') : t('beats_before');
    }
    show(false);
    if (reduce) show(true); else timer = setInterval(() => show(!after), 2800);
    return () => clearInterval(timer);
  }


  function demoSemitone(box) {
    const p = piano();
    const cap = h('p', 'demo-cap', '');
    cap.setAttribute('aria-live', 'polite');
    const btn = h('button', 'btn small', t('listen'));
    btn.type = 'button';
    box.appendChild(p.root); box.appendChild(cap); box.appendChild(btn);
    const STAGES = [[0, 1, 'semi_1'], [0, 2, 'semi_2'], [0, 12, 'semi_3']];
    let k = 0, timer = null;
    function show(i, sound) {
      k = i;
      const [a, b, key] = STAGES[i];
      p.clear();
      p.keys[a].classList.add('on'); p.keys[b].classList.add('on');
      cap.textContent = t(key);
      if (sound) { tone(a, 0, 0.5); tone(b, 0.45, 0.6); }
    }
    function loop() { show((k + 1) % STAGES.length); timer = setTimeout(loop, 2800); }
    show(0);
    if (!reduce) timer = setTimeout(loop, 2800);
    btn.addEventListener('click', () => { clearTimeout(timer); show(k, true); timer = reduce ? null : setTimeout(loop, 3200); });
    return () => clearTimeout(timer);
  }

  const PCS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const MAJ_STEPS = [0, 2, 4, 5, 7, 9, 11], MIN_STEPS = [0, 2, 3, 5, 7, 8, 10];

  function demoFormula(box) {
    const p = piano();
    const q = h('p', 'demo-cap', t('tonic_pick'));
    const chips = h('div', 'chips pcs');
    const seg = h('div', 'seg');
    const bMaj = h('button', '', t('major')), bMin = h('button', '', t('minor'));
    bMaj.type = 'button'; bMin.type = 'button';
    seg.appendChild(bMaj); seg.appendChild(bMin);
    const cap = h('p', 'demo-cap', '');
    cap.setAttribute('aria-live', 'polite');
    const pat = h('p', 'demo-pattern', '');
    const btn = h('button', 'btn small', t('listen'));
    btn.type = 'button';
    const chipEls = PCS.map((n, i) => {
      const c = h('button', 'chip', n);
      c.type = 'button';
      c.addEventListener('click', () => { stop(); tonic = i; draw(); });
      chips.appendChild(c);
      return c;
    });
    box.appendChild(q); box.appendChild(chips); box.appendChild(seg); box.appendChild(p.root);
    box.appendChild(cap); box.appendChild(pat); box.appendChild(btn);
    let tonic = 0, mode = 'major', timer = null;
    function scale() { return (mode === 'major' ? MAJ_STEPS : MIN_STEPS).map((d) => (tonic + d) % 12); }
    function draw() {
      const pcs = scale();
      p.clear();
      Object.keys(p.keys).forEach((s) => {
        const pc = s % 12;
        const key = p.keys[s];
        key.classList.toggle('tonic', pc === tonic);
        if (pcs.indexOf(pc) >= 0) { key.style.transitionDelay = (reduce ? 0 : pcs.indexOf(pc) * 30) + 'ms'; key.classList.add('on'); }
      });
      chipEls.forEach((c, i) => c.setAttribute('aria-pressed', String(i === tonic)));
      bMaj.setAttribute('aria-pressed', String(mode === 'major'));
      bMin.setAttribute('aria-pressed', String(mode === 'minor'));
      cap.textContent = PCS[tonic] + ' ' + (mode === 'major' ? 'major' : 'minor') + ': ' + pcs.map((x) => PCS[x]).join(' ');
      pat.textContent = t(mode === 'major' ? 'pattern_major' : 'pattern_minor');
    }
    function stop() { clearInterval(timer); timer = null; }
    bMaj.addEventListener('click', () => { stop(); mode = 'major'; draw(); });
    bMin.addEventListener('click', () => { stop(); mode = 'minor'; draw(); });
    btn.addEventListener('click', () => {
      const steps = (mode === 'major' ? MAJ_STEPS : MIN_STEPS).map((d) => tonic + d).concat([tonic + 12]);
      steps.forEach((x, idx) => tone(x, idx * 0.33, 0.5));
    });
    draw();
    if (!reduce) timer = setInterval(() => { tonic = (tonic + 7) % 12; draw(); }, 3200);
    return stop;
  }

  function demoRelative(box) {
    const p = piano();
    const seg = h('div', 'seg');
    const bC = h('button', '', 'C major'), bA = h('button', '', 'A minor');
    bC.type = 'button'; bA.type = 'button';
    seg.appendChild(bC); seg.appendChild(bA);
    const cap = h('p', 'demo-cap', '');
    cap.setAttribute('aria-live', 'polite');
    const btn = h('button', 'btn small', t('listen'));
    btn.type = 'button';
    box.appendChild(seg); box.appendChild(p.root); box.appendChild(cap); box.appendChild(btn);
    const NOTESET = [0, 2, 4, 5, 7, 9, 11];
    let tonic = 0, timer = null;
    function draw() {
      p.clear();
      Object.keys(p.keys).forEach((s) => {
        const key = p.keys[s], pc = s % 12;
        key.classList.toggle('tonic', pc === tonic);
        if (NOTESET.indexOf(pc) >= 0) key.classList.add('on');
      });
      bC.setAttribute('aria-pressed', String(tonic === 0));
      bA.setAttribute('aria-pressed', String(tonic === 9));
      cap.textContent = t('rel_same') + ': ' + t('rel_tonic') + ' ' + PCS[tonic];
    }
    function stop() { clearInterval(timer); timer = null; }
    bC.addEventListener('click', () => { stop(); tonic = 0; draw(); });
    bA.addEventListener('click', () => { stop(); tonic = 9; draw(); });
    btn.addEventListener('click', () => {
      const order = tonic === 0 ? [0, 2, 4, 5, 7, 9, 11, 12] : [-3, -1, 0, 2, 4, 5, 7, 9];
      order.forEach((s, idx) => tone(s, idx * 0.33, 0.5));
    });
    draw();
    if (!reduce) timer = setInterval(() => { tonic = tonic === 0 ? 9 : 0; draw(); }, 3200);
    return stop;
  }

  function demoLimit(box) {
    const NEED = 5;
    const lab = h('label', 'lim-label', t('lim_label'));
    lab.htmlFor = 'demo-limit';
    const row = h('div', 'range-row');
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = '0'; inp.max = '6'; inp.step = '1'; inp.value = '4'; inp.id = 'demo-limit';
    const out = h('output', '', '');
    row.appendChild(inp); row.appendChild(out);
    const bar = h('div', 'limbar');
    bar.setAttribute('aria-hidden', 'true');
    const cells = [];
    for (let i = 0; i <= 6; i++) {
      const c = h('div', 'limcell');
      c.appendChild(h('span', '', String(i)));
      bar.appendChild(c); cells.push(c);
    }
    const need = h('p', 'demo-cap', t('lim_need', NEED));
    const verdict = h('p', 'lim-verdict', '');
    verdict.setAttribute('aria-live', 'polite');
    box.appendChild(lab); box.appendChild(row); box.appendChild(bar); box.appendChild(need); box.appendChild(verdict);
    function draw() {
      const L = +inp.value;
      out.textContent = '±' + L;
      cells.forEach((c, i) => {
        c.classList.toggle('inside', i <= L);
        c.classList.toggle('need', i === NEED);
      });
      const over = NEED > L;
      verdict.textContent = over ? t('lim_over', L) : t('lim_ok');
      verdict.classList.toggle('over', over);
    }
    inp.addEventListener('input', draw);
    draw();
    return () => {};
  }

  function demoOctave(box) {
    const N = 8, SP = 11;
    const lanes = h('div', 'lanes');
    lanes.setAttribute('aria-hidden', 'true');
    function lane(label, cls, count, spacing) {
      lanes.appendChild(h('div', 'lane-label', label));
      const l = h('div', 'lane');
      const ticks = [];
      for (let i = 0; i < count; i++) {
        const tk = h('span', 'tick ' + cls);
        tk.style.left = (i * spacing) + '%';
        tk.style.transition = 'background 0.15s, transform 0.15s';
        l.appendChild(tk); ticks.push(tk);
      }
      lanes.appendChild(l);
      return ticks;
    }
    const slow = lane(t('oct_65'), 'gd', N / 2, SP * 2);
    const fast = lane(t('oct_130'), 'reg', N, SP);
    for (let i = 0; i < N / 2; i++) {
      const g = h('span', 'guide');
      g.style.left = (i * SP * 2) + '%';
      g.style.opacity = '0.8';
      lanes.appendChild(g);
    }
    const cap = h('p', 'demo-cap', t('oct_cap'));
    box.appendChild(lanes); box.appendChild(cap);
    let i = 0, timer = null;
    function flash() {
      slow.concat(fast).forEach((tk) => { tk.style.transform = ''; tk.style.opacity = ''; });
      fast[i].style.transform = 'scaleY(1.25)';
      if (i % 2 === 0) { slow[i / 2].style.transform = 'scaleY(1.25)'; }
      slow.forEach((tk, k) => { tk.style.opacity = k === i / 2 ? '1' : '0.55'; });
      fast.forEach((tk, k) => { tk.style.opacity = k === i ? '1' : '0.55'; });
      i = (i + 1) % N;
    }
    if (!reduce) { flash(); timer = setInterval(flash, 450); }
    return () => clearInterval(timer);
  }

  const DEMOS = { scale: demoScale, mode: demoMode, shift: demoShift, tap: demoTap, beats: demoBeats,
    semitone: demoSemitone, formula: demoFormula, relative: demoRelative, limit: demoLimit, octave: demoOctave };

  // ---------- вступление ----------
  const intro = $('intro'), card = $('intro-card');
  const introMash = new M.MashHD($('mash-intro'), 'wave');
  grooveFn = (ms) => introMash.groove(ms);
  let cleanup = null, cancelType = null, lastFocus = null, introOpen = true;

  function reset() {
    if (cleanup) { cleanup(); cleanup = null; }
    if (cancelType) { cancelType(); cancelType = null; }
    card.textContent = '';
    card.className = 'intro-card';
  }
  function focusFirst() {
    const b = card.querySelector('button');
    if (b) b.focus({ preventScroll: true });
  }
  function typeText(el, str) {
    if (reduce) { el.textContent = str; introMash.setTalking(false); return () => {}; }
    let n = 0, done = false;
    introMash.setTalking(true);
    const timer = setInterval(() => {
      n += 1;
      el.textContent = str.slice(0, n);
      if (n >= str.length) finish();
    }, 18);
    function finish() {
      if (done) return;
      done = true;
      clearInterval(timer);
      el.textContent = str;
      introMash.setTalking(false);
    }
    el.addEventListener('click', finish);
    return finish;
  }

  const POSE_BY_DEMO = { semitone: 'point', scale: 'talk', formula: 'think', mode: 'talk', relative: 'point', shift: 'point', limit: 'point', tap: 'talk', octave: 'point', beats: 'point' };

  function renderLang() {
    reset();
    intro.dataset.size = 'md';
    introMash.setPose('wave');
    const q = h('h2', 'q', 'Какой язык вы бы хотели выбрать:');
    q.id = 'intro-title';
    const q2 = h('p', 'q-sub', 'Which language would you like to choose:');
    const row = h('div', 'choices');
    [['ru', 'Русский'], ['en', 'English']].forEach(([code, name]) => {
      const b = h('button', 'choice', name);
      b.type = 'button';
      b.lang = code;
      b.addEventListener('click', () => { I.set(code); renderExp(); });
      row.appendChild(b);
    });
    card.appendChild(q); card.appendChild(q2); card.appendChild(row);
    focusFirst();
  }

  function renderExp() {
    reset();
    intro.dataset.size = 'md';
    introMash.setPose('think');
    const q = h('h2', 'q', t('exp_q'));
    q.id = 'intro-title';
    const row = h('div', 'choices');
    [['exp_yes', 'exp_yes_sub', closeIntro], ['exp_no', 'exp_no_sub', () => renderTut(0)]].forEach(([a, b, fn]) => {
      const btn = h('button', 'choice', t(a));
      btn.type = 'button';
      btn.appendChild(h('small', '', t(b)));
      btn.addEventListener('click', fn);
      row.appendChild(btn);
    });
    const back = h('button', 'link', t('back'));
    back.type = 'button';
    back.addEventListener('click', renderLang);
    card.appendChild(q); card.appendChild(row); card.appendChild(back);
    focusFirst();
  }

  function renderTut(i) {
    reset();
    const steps = t('tut');
    const s = steps[i];
    intro.dataset.size = 'lg';
    introMash.setPose(POSE_BY_DEMO[s.demo] || (s.pose === 'talk' ? 'think' : s.pose));
    card.classList.add('tut');
    const count = h('div', 'step-count', (i + 1) + ' / ' + steps.length);
    const title = h('h2', 'q', s.title);
    title.id = 'intro-title';
    const text = h('p', 'tut-text');
    const typed = h('span', '', '');
    typed.setAttribute('aria-hidden', 'true');
    const ghost = h('span', 'ghost', s.text);
    ghost.setAttribute('aria-hidden', 'true');
    text.appendChild(typed); text.appendChild(ghost); text.appendChild(h('span', 'sr', s.text));
    card.appendChild(count); card.appendChild(title); card.appendChild(text);
    if (s.demo) {
      const box = h('div', 'demo');
      card.appendChild(box);
      cleanup = DEMOS[s.demo](box);
    }
    const dots = h('div', 'dots');
    dots.setAttribute('aria-hidden', 'true');
    steps.forEach((_, k) => dots.appendChild(h('span', k === i ? 'on' : '')));
    card.appendChild(dots);
    const nav = h('div', 'nav');
    const next = h('button', 'primary', i === steps.length - 1 ? t('finish') : t('next'));
    next.type = 'button';
    next.addEventListener('click', () => {
      if (i === steps.length - 1) { try { localStorage.setItem('mashaper.tutDone', '1'); } catch (e) { /* без хранилища покажем снова */ } closeIntro(); }
      else renderTut(i + 1);
    });
    nav.appendChild(next);
    if (i > 0) {
      const back = h('button', 'btn', t('back'));
      back.type = 'button';
      back.addEventListener('click', () => renderTut(i - 1));
      nav.insertBefore(back, next);
    }
    if (i < steps.length - 1) {
      const skip = h('button', 'link', t('skip'));
      skip.type = 'button';
      skip.addEventListener('click', closeIntro);
      nav.appendChild(skip);
    }
    card.appendChild(nav);
    cancelType = typeText(typed, s.text);
    next.focus({ preventScroll: true });
    intro.scrollTop = 0;
  }

  function openIntro(screen) {
    lastFocus = document.activeElement;
    introOpen = true;
    intro.hidden = false;
    intro.classList.remove('closing');
    document.body.style.overflow = 'hidden';
    if (screen === 'tut') renderTut(0); else renderLang();
  }
  function closeIntro() {
    reset();
    introOpen = false;
    introMash.setTalking(false);
    intro.classList.add('closing');
    document.body.style.overflow = '';
    const sleeper = $('sleeper');
    sleeper.classList.remove('drop');
    void sleeper.offsetWidth;
    if (!reduce) sleeper.classList.add('drop');
    setTimeout(() => { if (!introOpen) intro.hidden = true; }, reduce ? 0 : 350);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && introOpen) closeIntro(); });
  $('help').addEventListener('click', () => openIntro('tut'));

  // ---------- Мэш спит на кнопке ----------
  const wrap = $('run-wrap'), sc = $('mash-sleep'), bubble = $('bubble');
  const life = new M.Mash(sc, 'sleep');
  function fit(pose) {
    const d = pose === 'sleep' ? M.SLEEP : M.STAND;
    sc.style.setProperty('--cw', d[0]);
    sc.style.setProperty('--ch', d[1]);
  }
  fit('sleep');
  let bubbleTimer = null, phraseIdx = 0;
  function say(text, ms) {
    bubble.textContent = text;
    bubble.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms || 3000);
  }
  let asleep = true, backTimer = null, sleepTimer = null;
  function setAsleep(on) {
    asleep = on;
    wrap.classList.toggle('awake', !on);
    fit(on ? 'sleep' : 'stand');
    life.setPose(on ? 'sleep' : 'stand');
  }
  $('sleeper').addEventListener('click', () => {
    if (!asleep) return;
    const ph = t('sleep_phrases');
    say(ph[phraseIdx++ % ph.length], 3200);
  });
  function wake(text, ms) {
    clearTimeout(backTimer); clearTimeout(sleepTimer);
    asleep = false;
    wrap.classList.add('awake');
    fit('stand');
    life.setPose('cheer');
    say(text, ms);
    backTimer = setTimeout(() => life.setPose('stand'), ms);
    sleepTimer = setTimeout(() => { setAsleep(true); say(t('wake_reset'), 2600); }, ms + 7000);
  }
  window.addEventListener('mash', (e) => {
    if (e.detail === 'ready') wake(t('wake_ready'), 3500);
    else if (e.detail === 'done') wake(t('wake_done'), 4500);
  });

  let tutDone = false;
  try { tutDone = localStorage.getItem('mashaper.tutDone') === '1'; } catch (e) { /* ок */ }
  document.documentElement.classList.remove('no-intro');
  if (tutDone) {
    introOpen = false;
    intro.hidden = true;
    reset();
  } else {
    openIntro('lang');
  }
})();
