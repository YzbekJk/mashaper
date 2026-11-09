/* Пасхалка: 7 нажатий подряд на Мэша открывают кликер с бананом. */
(function () {
  'use strict';
  const I = self.I18n;
  const t = (k, ...a) => I.t(k, ...a);
  I.extend({
    ru: {
      ck_title: 'Банановый кликер',
      ck_bananas: (n) => 'Бананов: ' + n,
      ck_rate: (c, s) => '+' + c + ' за клик · +' + s + ' в секунду',
      ck_hint: 'Жми на банан!',
      ck_close: 'Закрыть',
      ck_reset: 'Начать заново',
      ck_reset_q: 'Сбросить все бананы и улучшения?',
      ck_up_power: 'Крепкий палец',
      ck_up_power_d: '+1 банан за клик',
      ck_up_helper: 'Мини-Мэш',
      ck_up_helper_d: '+1 банан в секунду',
      ck_up_farm: 'Банановая ферма',
      ck_up_farm_d: '+8 бананов в секунду',
      ck_owned: (n) => 'куплено: ' + n,
    },
    en: {
      ck_title: 'Banana clicker',
      ck_bananas: (n) => 'Bananas: ' + n,
      ck_rate: (c, s) => '+' + c + ' per click · +' + s + ' per second',
      ck_hint: 'Tap the banana!',
      ck_close: 'Close',
      ck_reset: 'Start over',
      ck_reset_q: 'Reset all bananas and upgrades?',
      ck_up_power: 'Strong finger',
      ck_up_power_d: '+1 banana per click',
      ck_up_helper: 'Mini-Mash',
      ck_up_helper_d: '+1 banana per second',
      ck_up_farm: 'Banana farm',
      ck_up_farm_d: '+8 bananas per second',
      ck_owned: (n) => 'owned: ' + n,
    },
  });

  const KEY = 'mashaper.banana';
  const UPS = [
    { id: 'power', base: 10, grow: 1.4, click: 1, auto: 0 },
    { id: 'helper', base: 25, grow: 1.2, click: 0, auto: 1 },
    { id: 'farm', base: 250, grow: 1.25, click: 0, auto: 8 },
  ];
  let S = { n: 0, owned: { power: 0, helper: 0, farm: 0 } };
  try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw && typeof raw.n === 'number') S = { n: raw.n, owned: Object.assign(S.owned, raw.owned) }; } catch (e) { /* без хранилища тоже работает */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ок */ } };
  const cost = (u) => Math.floor(u.base * Math.pow(u.grow, S.owned[u.id]));
  const perClick = () => 1 + S.owned.power;
  const perSec = () => S.owned.helper + 8 * S.owned.farm;
  const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(Math.floor(n)));

  const BANANA = [
    '............oo..',
    '...........obbo.',
    '..........oyyyo.',
    '.........oyyyyo.',
    '........oyyyydo.',
    '.......oyyyyydo.',
    '......oyyyyyydo.',
    '.....oyyyyyydo..',
    '....oyyyyyydo...',
    '...oyyyyyyydo...',
    '..oyyyyyydddo...',
    '..oyyyydddoo....',
    '..obbyydoo......',
    '...ooooo........',
  ];
  const COL = { o: '#4A3208', y: '#FFD93B', d: '#D9A21B', b: '#7A5416' };
  function drawBanana(canvas) {
    canvas.width = 16; canvas.height = 16;
    const g = canvas.getContext('2d');
    BANANA.forEach((row, y) => [...row].forEach((ch, x) => { if (COL[ch]) { g.fillStyle = COL[ch]; g.fillRect(x, y + 1, 1, 1); } }));
  }

  let overlay = null, timer = null;
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  function close() {
    if (!overlay) return;
    clearInterval(timer); timer = null; save();
    overlay.remove(); overlay = null;
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function open() {
    if (overlay) return;
    overlay = el('div', 'ck');
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', t('ck_title'));
    const card = el('div', 'ck-card');
    const head = el('div', 'ck-head');
    head.append(el('h2', 'ck-title', t('ck_title')));
    const x = el('button', 'btn small ck-x', t('ck_close')); x.type = 'button'; x.addEventListener('click', close);
    head.append(x);
    const count = el('p', 'ck-count'), rate = el('p', 'ck-rate');
    const field = el('div', 'ck-field');
    const btn = el('button', 'ck-banana'); btn.type = 'button'; btn.setAttribute('aria-label', t('ck_hint'));
    const cv = el('canvas'); drawBanana(cv); btn.append(cv);
    field.append(btn);
    const hint = el('p', 'ck-hint', t('ck_hint'));
    const list = el('div', 'ck-ups');
    const rows = UPS.map((u) => {
      const b = el('button', 'ck-up'); b.type = 'button';
      const name = el('strong', '', t('ck_up_' + u.id)), desc = el('span', '', t('ck_up_' + u.id + '_d'));
      const own = el('em'), price = el('b');
      b.append(name, desc, own, price);
      b.addEventListener('click', () => {
        const c = cost(u);
        if (S.n >= c) { S.n -= c; S.owned[u.id]++; save(); render(); }
      });
      list.append(b);
      return { u, b, own, price };
    });
    const reset = el('button', 'ck-reset', t('ck_reset')); reset.type = 'button';
    reset.addEventListener('click', () => { if (confirm(t('ck_reset_q'))) { S = { n: 0, owned: { power: 0, helper: 0, farm: 0 } }; save(); render(); } });
    card.append(head, count, rate, field, hint, list, reset);
    overlay.append(card);
    document.body.append(overlay);

    function render() {
      count.textContent = t('ck_bananas', fmt(S.n));
      rate.textContent = t('ck_rate', perClick(), perSec());
      rows.forEach(({ u, b, own, price }) => {
        const c = cost(u);
        own.textContent = t('ck_owned', S.owned[u.id]);
        price.textContent = '🍌 ' + fmt(c);
        b.disabled = S.n < c;
      });
    }
    btn.addEventListener('click', (e) => {
      const add = perClick(); S.n += add; render();
      btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
      const r = field.getBoundingClientRect();
      const f = el('span', 'ck-float', '+' + add);
      const px = e.clientX ? e.clientX - r.left : r.width / 2, py = e.clientY ? e.clientY - r.top : r.height / 2;
      f.style.left = px + 'px'; f.style.top = py + 'px';
      field.append(f); setTimeout(() => f.remove(), 800);
    });
    timer = setInterval(() => { const s = perSec(); if (s) { S.n += s; render(); } save(); }, 1000);
    document.addEventListener('keydown', onKey);
    render();
    btn.focus();
  }

  // 7 нажатий подряд на Мэша (спящего или в обучении), пауза между ними не больше 2 секунд
  let clicks = 0, last = 0;
  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('#sleeper, #mash-intro')) return;
    try { const sel = getSelection(); if (sel) sel.removeAllRanges(); } catch (err) { /* ок */ }
    const now = Date.now();
    clicks = now - last > 2000 ? 1 : clicks + 1;
    last = now;
    if (clicks >= 7) { clicks = 0; open(); }
  }, true);
  document.addEventListener('mousedown', (e) => { if (e.detail > 1 && e.target.closest && e.target.closest('#sleeper, #mash-intro')) e.preventDefault(); }, true);
  self.MashaperClicker = { open };
})();
