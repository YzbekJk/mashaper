/* Мэш: пиксельный маскот. Рисуется на canvas по пикселям, контур строится автоматически. */
(function (root) {
  'use strict';

  const C = {
    line: '#2B2233',
    hair: '#F7F7FC', hairS: '#D5D9EC',
    cap: '#FF5C9E', capS: '#D6226F', capL: '#FF9CC5',
    skin: '#FFE3D1', skinS: '#F2C4AA',
    shirt: '#FFFFFF', shirtS: '#C9CDE0',
    pants: '#FF8FBF', pantsS: '#E5619C',
    sole: '#B8BCD0',
    blush: '#FFA9C4', tongue: '#FF6F91', white: '#FFFFFF',
  };

  function makeGrid(w, h) { return { w, h, px: new Array(w * h).fill(null) }; }
  function put(g, x, y, c) { if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.px[y * g.w + x] = c; }
  function rect(g, x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, c);
  }
  function outline(g) {
    const src = g.px.slice();
    const at = (x, y) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? null : src[y * g.w + x]);
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        if (src[y * g.w + x]) continue;
        if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) g.px[y * g.w + x] = C.line;
      }
    }
  }

  // ---------- стоящий Мэш (33 x 43) ----------
  const STAND_W = 33, STAND_H = 43;
  function drawStand(o) {
    const g = makeGrid(STAND_W, STAND_H);
    const R = (x, y, w, h, c) => rect(g, x + 1, y + 1, w, h, c);
    const P = (x, y, c) => put(g, x + 1, y + 1, c);

    // волосы
    R(8, 5, 16, 14, C.hair);
    P(8, 5, null); P(23, 5, null); P(8, 18, null); P(23, 18, null);
    R(8, 12, 1, 6, C.hairS); R(23, 12, 1, 6, C.hairS);
    // кепка задом наперёд: козырёк торчит сзади, спереди виден только купол
    R(11, 1, 10, 1, C.cap);
    R(9, 2, 14, 4, C.cap);
    R(8, 6, 16, 1, C.capS);
    R(7, 5, 1, 2, C.capS); R(24, 5, 1, 2, C.capS);
    R(12, 2, 3, 1, C.capL);
    R(15, 0, 2, 1, C.capS);
    R(15, 3, 2, 2, C.white);
    // лицо
    R(10, 7, 12, 3, C.hair);
    R(10, 10, 12, 9, C.skin);
    R(9, 13, 1, 3, C.skin); R(22, 13, 1, 3, C.skin);
    R(10, 10, 3, 1, C.hair); R(15, 10, 2, 1, C.hair); R(19, 10, 3, 1, C.hair);
    R(10, 11, 1, 1, C.hair); R(21, 11, 1, 1, C.hair);
    R(13, 9, 1, 1, C.hairS); R(18, 9, 1, 1, C.hairS);
    R(11, 16, 2, 1, C.blush); R(19, 16, 2, 1, C.blush);
    // глаза
    if (o.eyes === 'closed') {
      R(12, 15, 2, 1, C.line); R(18, 15, 2, 1, C.line);
    } else if (o.eyes === 'happy') {
      P(11, 15, C.line); P(12, 14, C.line); P(13, 15, C.line);
      P(18, 15, C.line); P(19, 14, C.line); P(20, 15, C.line);
    } else {
      R(12, 13, 2, 3, C.line); R(18, 13, 2, 3, C.line);
      P(12, 13, C.white); P(18, 13, C.white);
    }
    // рот
    if (o.mouth === 'open') {
      R(15, 17, 2, 2, C.line); P(15, 18, C.tongue); P(16, 18, C.tongue);
    } else if (o.mouth === 'smile') {
      P(14, 16, C.line); R(15, 17, 2, 1, C.line); P(17, 16, C.line);
    } else {
      R(15, 17, 2, 1, C.line);
    }
    R(14, 19, 4, 1, C.skinS);
    // футболка
    R(10, 20, 12, 10, C.shirt);
    R(14, 20, 4, 1, C.shirtS);
    R(10, 29, 12, 1, C.shirtS);
    R(10, 21, 1, 8, C.shirtS);
    R(17, 22, 1, 5, C.capS); R(18, 22, 2, 1, C.capS); R(15, 26, 2, 2, C.capS);
    // руки
    R(8, 21, 2, 3, C.shirt);
    R(8, 24, 2, 5, C.skin);
    if (o.arm === 'wave0' || o.arm === 'wave1') {
      const w = o.arm === 'wave1' ? 1 : 0;
      R(22, 19, 3 + w, 3, C.shirt);
      R(24 + w, 11, 2, 8, C.skin);
      R(24 + w, 10, 2, 1, C.skinS);
    } else {
      R(22, 21, 2, 3, C.shirt);
      R(22, 24, 2, 5, C.skin);
    }
    // штаны
    R(10, 30, 12, 4, C.pants);
    R(10, 30, 12, 1, C.pantsS);
    R(10, 34, 5, 4, C.pants); R(17, 34, 5, 4, C.pants);
    R(14, 34, 1, 4, C.pantsS); R(17, 34, 1, 4, C.pantsS);
    // кроссовки
    R(9, 38, 6, 2, C.white); R(17, 38, 6, 2, C.white);
    R(9, 40, 6, 1, C.sole); R(17, 40, 6, 1, C.sole);
    R(11, 38, 2, 1, C.cap); R(19, 38, 2, 1, C.cap);
    outline(g);
    return g;
  }

  // ---------- спящий Мэш (42 x 18) ----------
  const SLEEP_W = 42, SLEEP_H = 18;
  function drawSleep(o) {
    const g = makeGrid(SLEEP_W, SLEEP_H);
    const R = (x, y, w, h, c) => rect(g, x + 1, y + 2, w, h, c);
    const P = (x, y, c) => put(g, x + 1, y + 2, c);
    const up = o.breath ? 1 : 0;
    // голова на «подушке»
    R(1, 3, 12, 11, C.hair);
    P(1, 3, null); P(12, 3, null);
    R(2, 1, 10, 3, C.cap); R(3, 0, 8, 1, C.cap);
    R(1, 4, 12, 1, C.capS);
    R(4, 1, 3, 1, C.capL);
    R(6, -1 + 1, 2, 1, C.capS);
    R(0, 3, 1, 2, C.capS); R(13, 3, 1, 2, C.capS);
    R(3, 6, 9, 7, C.skin);
    R(3, 6, 2, 1, C.hair); R(7, 6, 2, 1, C.hair); R(10, 6, 2, 1, C.hair);
    R(4, 9, 2, 1, C.line); R(9, 9, 2, 1, C.line);
    R(3, 10, 2, 1, C.blush); R(10, 10, 2, 1, C.blush);
    if (o.mouth) R(7, 11, 2, 2, C.line); else R(7, 11, 2, 1, C.line);
    // тело
    R(13, 8 - up, 11, 6 + up, C.shirt);
    R(13, 13, 11, 1, C.shirtS);
    R(17, 9 - up, 1, 3, C.capS); R(18, 9 - up, 2, 1, C.capS); R(15, 11 - up, 2, 2, C.capS);
    R(24, 9, 10, 5, C.pants);
    R(24, 9, 10, 1, C.pantsS);
    R(30, 9, 1, 5, C.pantsS);
    // ноги и кроссовки
    R(34, 7, 4, 7, C.white);
    R(37, 7, 1, 7, C.sole);
    R(34, 8, 3, 1, C.cap);
    // рука под щекой
    R(11, 11, 6, 2, C.skin);
    R(13, 10, 3, 1, C.shirt);
    outline(g);
    return g;
  }

  function paint(canvas, g) {
    if (canvas.width !== g.w || canvas.height !== g.h) { canvas.width = g.w; canvas.height = g.h; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, g.w, g.h);
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const c = g.px[y * g.w + x];
        if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }
      }
    }
  }

  /**
   * Оживляет canvas. Состояния: pose = 'stand' | 'wave' | 'talk' | 'sleep' | 'cheer'.
   * 'talk' двигает ртом; 'wave' машет рукой; 'cheer' машет и улыбается; 'sleep' дышит.
   */
  function Mash(canvas, pose) {
    this.canvas = canvas;
    this.pose = pose || 'stand';
    this.talking = false;
    this.step = 0;
    this.blinkUntil = 0;
    this.nextBlink = 0;
    this.reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.timer = null;
    this.render();
    this.start();
  }
  Mash.prototype.setPose = function (pose) { this.pose = pose; this.render(); };
  Mash.prototype.setTalking = function (on) { this.talking = !!on; this.render(); };
  Mash.prototype.start = function () {
    if (this.timer || this.reduce) return;
    this.timer = setInterval(() => this.tick(), 140);
  };
  Mash.prototype.stop = function () { clearInterval(this.timer); this.timer = null; };
  Mash.prototype.tick = function () {
    if (!this.canvas.isConnected || this.canvas.offsetParent === null) return;
    this.step++;
    const now = Date.now();
    if (now > this.nextBlink) { this.blinkUntil = now + 160; this.nextBlink = now + 2200 + Math.random() * 2600; }
    this.render();
  };
  Mash.prototype.render = function () {
    const now = Date.now();
    if (this.pose === 'sleep') {
      const breath = !this.reduce && Math.floor(this.step / 7) % 2 === 1;
      paint(this.canvas, drawSleep({ breath, mouth: !this.reduce && Math.floor(this.step / 7) % 2 === 1 }));
      return;
    }
    const blink = now < this.blinkUntil;
    const o = { eyes: blink ? 'closed' : 'open', mouth: 'smile', arm: 'down' };
    if (this.pose === 'wave' || this.pose === 'cheer') {
      o.arm = Math.floor(this.step / 2) % 2 ? 'wave1' : 'wave0';
    }
    if (this.pose === 'cheer') { o.eyes = 'happy'; o.mouth = 'open'; }
    if (this.talking && !this.reduce) o.mouth = Math.floor(this.step / 1) % 2 ? 'open' : 'closed';
    paint(this.canvas, drawStand(o));
  };

  root.Mascot = { Mash, STAND: [STAND_W, STAND_H], SLEEP: [SLEEP_W, SLEEP_H] };
})(self);
