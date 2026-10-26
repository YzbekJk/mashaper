/* Мэш в высоком разрешении (64 x 88) для обучения: объём, детали лица, одежда, позы, ноты и искры.
   Каждый кадр строится заново: фигуры, затем автоматическая светотень и контур. */
(function (root) {
  'use strict';
  const W = 64, H = 88;

  const RAMP = {
    skin:  { base: '#FFE3D1', shade: '#F2C4AA', deep: '#DDA68A', light: '#FFF1E8' },
    hair:  { base: '#F4F5FC', shade: '#D3D8EE', deep: '#AEB6D8', light: '#FFFFFF' },
    cap:   { base: '#FF5C9E', shade: '#D6226F', deep: '#A8135A', light: '#FF9CC5' },
    shirt: { base: '#FFFFFF', shade: '#DADDEE', deep: '#B7BCD6', light: '#FFFFFF' },
    pants: { base: '#FF8FBF', shade: '#E5619C', deep: '#C23F7D', light: '#FFB5D3' },
    shoe:  { base: '#FFFFFF', shade: '#D9DCEE', deep: '#B7BCD6', light: '#FFFFFF' },
    sole:  { base: '#C4C8DC', shade: '#9EA3BE', deep: '#7E839F', light: '#DDE0EE' },
    lace:  { base: '#FF5C9E', shade: '#D6226F', deep: '#A8135A', light: '#FF9CC5' },
    iris:  { base: '#6C4FA8', shade: '#4B3580', deep: '#3A2866', light: '#A58BDB' },
    line:  { base: '#2B2233' },
    pupil: { base: '#2B2233' },
    blush: { base: '#FFA9C4' },
    tongue:{ base: '#FF6F91' },
    white: { base: '#FFFFFF' },
  };
  const AUTO = { skin: 1, hair: 1, cap: 1, shirt: 1, pants: 1, shoe: 1, sole: 1 };

  function makeGrid() { return { r: new Array(W * H).fill(null), t: new Array(W * H).fill(null) }; }
  function put(g, x, y, ramp, tone) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    g.r[y * W + x] = ramp; g.t[y * W + x] = tone || null;
  }
  function rect(g, x, y, w, h, ramp, tone) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, ramp, tone);
  }
  function ellipse(g, cx, cy, rx, ry, ramp, tone) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) put(g, x, y, ramp, tone);
      }
    }
  }
  function poly(g, pts, ramp, tone) {
    let y0 = Infinity, y1 = -Infinity;
    pts.forEach((p) => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yy = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) {
          xs.push(a[0] + (yy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) put(g, x, y, ramp, tone);
      }
    }
  }
  function thick(g, x0, y0, x1, y1, r, ramp, tone) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d * 2));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      ellipse(g, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, r, r, ramp, tone);
    }
  }

  // светотень: верх и лево светлее, низ и право темнее
  function shade(g) {
    const src = g.r.slice();
    const same = (x, y, r) => x >= 0 && y >= 0 && x < W && y < H && src[y * W + x] === r;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, r = src[i];
        if (!r || !AUTO[r] || g.t[i]) continue;
        const lit = !same(x - 1, y, r) || !same(x, y - 1, r);
        const dark = !same(x + 1, y, r) || !same(x, y + 1, r);
        if (dark && !lit) g.t[i] = 'shade';
        else if (lit && !dark) g.t[i] = 'light';
      }
    }
  }
  function outline(g) {
    const src = g.r.slice();
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H || src[y * W + x] === 'line' ? null : src[y * W + x]);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (src[y * W + x]) continue;
        if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) { g.r[y * W + x] = 'line'; g.t[y * W + x] = null; }
      }
    }
  }

  // ---------- части тела ----------
  function joints(pose, f, b) {
    const J = {
      l: { S: [22, 50 + b], E: [18, 59 + b], W: [19, 67 + b] },
      r: { S: [42, 50 + b], E: [46, 59 + b], W: [45, 67 + b] },
    };
    if (pose === 'wave') {
      J.r = { S: [42, 50 + b], E: [50, 45 + b], W: [f.a ? 54 : 51, f.a ? 33 + b : 34 + b] };
    } else if (pose === 'talk') {
      J.l = { S: [22, 50 + b], E: [15, 59 + b], W: [f.a ? 17 : 19, f.a ? 49 + b : 51 + b] };
    } else if (pose === 'point') {
      J.r = { S: [42, 50 + b], E: [50, 53 + b], W: [58, 50 + b] };
    } else if (pose === 'think') {
      J.r = { S: [42, 50 + b], E: [47, 58 + b], W: [39, 46 + b] };
    } else if (pose === 'cheer') {
      J.l = { S: [22, 50 + b], E: [14, 41 + b], W: [12, f.a ? 27 + b : 30 + b] };
      J.r = { S: [42, 50 + b], E: [50, 41 + b], W: [52, f.a ? 30 + b : 27 + b] };
    } else if (pose === 'groove') {
      J.l = { S: [22, 50 + b], E: [16, 57 + b], W: [21, f.a ? 48 + b : 51 + b] };
      J.r = { S: [42, 50 + b], E: [48, 57 + b], W: [43, f.a ? 51 + b : 48 + b] };
    }
    return J;
  }
  function arm(g, j, side) {
    const [sx, sy] = j.S, [ex, ey] = j.E, [wx, wy] = j.W;
    const mx = sx + (ex - sx) * 0.45, my = sy + (ey - sy) * 0.45;
    // контур
    thick(g, sx, sy, ex, ey, 4.1, 'line');
    thick(g, ex, ey, wx, wy, 3.1, 'line');
    ellipse(g, wx, wy, 3.7, 3.7, 'line');
    // рукав и рука
    thick(g, sx, sy, mx, my, 3.3, 'shirt');
    thick(g, mx, my, ex, ey, 2.3, 'skin');
    thick(g, ex, ey, wx, wy, 2.1, 'skin');
    ellipse(g, wx, wy, 2.8, 2.8, 'skin');
    // большой палец
    const dir = side === 'l' ? -1 : 1;
    ellipse(g, wx + dir * 2.2, wy - 1.2, 1.2, 1.6, 'skin');
  }

  function drawFigure(o) {
    const g = makeGrid();
    const b = o.b, sw = o.sway;
    const J = joints(o.pose, o.f, b);
    const thinkArmAfter = o.pose === 'think';

    // волосы сзади
    ellipse(g, 32, 25 + b, 19, 19, 'hair');
    poly(g, [[14, 33 + b], [11 - sw, 45 + b], [18, 41 + b]], 'hair');
    poly(g, [[50, 33 + b], [53 + sw, 45 + b], [46, 41 + b]], 'hair');

    // шея
    rect(g, 29, 43 + b, 6, 5, 'skin', 'shade');

    // туловище
    poly(g, [[22, 48 + b], [42, 48 + b], [43.5, 53 + b], [41, 69 + b], [23, 69 + b], [20.5, 53 + b]], 'shirt');
    rect(g, 23, 67 + b, 18, 1, 'shirt', 'shade');
    rect(g, 26, 62 + b, 1, 4, 'shirt', 'shade'); rect(g, 37, 60 + b, 1, 5, 'shirt', 'shade');
    ellipse(g, 32, 48 + b, 6.4, 4.4, 'shirt', 'deep');
    ellipse(g, 32, 47.4 + b, 5.2, 3.2, 'skin', 'base');
    // принт: нота
    rect(g, 33, 53 + b, 1, 8, 'cap', 'base');
    ellipse(g, 31.2, 61 + b, 2.6, 1.9, 'cap', 'base');
    poly(g, [[34, 53 + b], [38, 55 + b], [38, 58 + b], [34, 56 + b]], 'cap', 'base');
    put(g, 27, 55 + b, 'cap', 'base'); put(g, 28, 57 + b, 'cap', 'shade'); put(g, 27, 59 + b, 'cap', 'base');

    // штаны
    poly(g, [[23, 68 + b], [41, 68 + b], [42.5, 74], [21.5, 74]], 'pants');
    rect(g, 22, 68 + b, 20, 2, 'pants', 'deep');
    rect(g, 22, 73, 10, 7, 'pants'); rect(g, 33, 73, 10, 7, 'pants');
    rect(g, 32, 73, 1, 7, 'line');
    rect(g, 22, 77, 10, 3, 'pants', 'light'); rect(g, 33, 77, 10, 3, 'pants', 'light');
    rect(g, 22, 77, 10, 1, 'pants', 'deep'); rect(g, 33, 77, 10, 1, 'pants', 'deep');
    rect(g, 26, 73, 1, 4, 'pants', 'shade'); rect(g, 38, 73, 1, 4, 'pants', 'shade');
    rect(g, 36, 70 + b, 4, 1, 'pants', 'shade');

    // кроссовки
    [[20, 31, 18, 32, -1], [33, 44, 32, 46, 1]].forEach(([x0, x1, sx0, sx1, d]) => {
      rect(g, x0, 80, x1 - x0 + 1, 5, 'shoe');
      ellipse(g, d < 0 ? x0 + 0.5 : x1 + 0.5, 83, 3.4, 2.7, 'shoe');
      rect(g, sx0 - (d < 0 ? 0 : 0), 85, sx1 - sx0 + 1, 2, 'sole');
      const lx = d < 0 ? 27 : 33;
      rect(g, lx, 80, 4, 1, 'lace', 'base'); rect(g, lx, 82, 4, 1, 'lace', 'base');
      rect(g, d < 0 ? 18 : 42, 82, 3, 2, 'lace', 'base');
    });

    // руки до головы
    if (!thinkArmAfter) { arm(g, J.l, 'l'); arm(g, J.r, 'r'); }

    // уши и лицо
    ellipse(g, 17.6, 33 + b, 2.2, 3, 'skin', 'shade');
    ellipse(g, 46.4, 33 + b, 2.2, 3, 'skin', 'shade');
    ellipse(g, 32, 31 + b, 14, 13, 'skin');
    rect(g, 18, 22 + b, 28, 6, 'skin');

    // румянец
    ellipse(g, 22.5, 38.6 + b, 2.6, 1.3, 'blush');
    ellipse(g, 41.5, 38.6 + b, 2.6, 1.3, 'blush');

    // глаза
    [25, 39].forEach((ex, idx) => {
      const out = idx === 0 ? -1 : 1;
      const lx = o.look[0], ly = o.look[1];
      if (o.eyes === 'open') {
        ellipse(g, ex + lx, 33.6 + b + ly, 3.1, 3.9, 'iris');
        ellipse(g, ex + lx, 34.4 + b + ly, 1.7, 2.3, 'pupil');
        rect(g, ex + lx - 1, 36 + b + ly, 3, 1, 'iris', 'light');
        rect(g, ex + lx - 2, 31.5 + b + ly, 2, 2, 'white');
        put(g, ex + lx + 1, 35.5 + b + ly, 'white');
        rect(g, ex - 4, 29 + b, 8, 1, 'line');
        put(g, ex + out * 4, 30 + b, 'line'); put(g, ex + out * 4, 29 + b, 'line'); put(g, ex + out * 5, 29 + b, 'line');
        put(g, ex - out * 4, 30 + b, 'line');
      } else if (o.eyes === 'closed') {
        rect(g, ex - 3, 34 + b, 7, 1, 'line');
        put(g, ex - 4, 33 + b, 'line'); put(g, ex + 4, 33 + b, 'line');
        put(g, ex + out * 5, 33 + b, 'line');
      } else {
        // happy ^ ^
        [[-3, 35], [-2, 34], [-1, 33], [0, 33], [1, 33], [2, 34], [3, 35]].forEach(([dx, y]) => put(g, ex + dx, y + b, 'line'));
        [[-3, 36], [3, 36]].forEach(([dx, y]) => put(g, ex + dx, y + b, 'line'));
        put(g, ex + out * 4, 36 + b, 'line');
      }
      // брови
      const up = o.brows === 'up' ? -1 : 0;
      rect(g, ex - 3, 26 + b + up, 6, 1, 'hair', 'deep');
      if (o.brows === 'think') put(g, ex + out * -3, 25 + b, 'hair', 'deep');
      else put(g, ex + out * 3, 27 + b + up, 'hair', 'deep');
    });

    // нос
    put(g, 32, 37 + b, 'skin', 'deep'); put(g, 33, 38 + b, 'skin', 'shade');

    // рот
    const my = 41 + b;
    if (o.mouth === 'open') {
      ellipse(g, 32.5, my + 1.4, 3, 2.3, 'line');
      ellipse(g, 32.5, my + 2.4, 1.9, 1, 'tongue');
    } else if (o.mouth === 'o') {
      ellipse(g, 32.5, my + 1.4, 1.6, 1.8, 'line');
    } else if (o.mouth === 'big') {
      ellipse(g, 32.5, my + 1.2, 3.6, 2.4, 'line');
      rect(g, 30, my, 5, 1, 'white');
      ellipse(g, 32.5, my + 2.4, 2.2, 0.9, 'tongue');
    } else if (o.mouth === 'closed') {
      rect(g, 30, my + 1, 5, 1, 'line');
    } else {
      rect(g, 30, my + 1, 5, 1, 'line');
      put(g, 29, my, 'line'); put(g, 35, my, 'line');
    }

    // чёлка и боковые пряди
    rect(g, 17, 21 + b, 30, 3, 'hair');
    [[20, 27], [25, 29], [31, 27], [37, 30], [42, 27]].forEach(([tx, ty], i) => {
      const s = i % 2 ? sw : -sw;
      poly(g, [[tx - 3.4, 22 + b], [tx + 3.4, 22 + b], [tx + s * 0.5, ty + b]], 'hair');
    });
    poly(g, [[16.5, 27 + b], [20, 23 + b], [20.5, 36 + b], [17.5, 43 + b - sw], [15.5, 35 + b]], 'hair');
    poly(g, [[47.5, 27 + b], [44, 23 + b], [43.5, 36 + b], [46.5, 43 + b + sw], [48.5, 35 + b]], 'hair');
    put(g, 23, 25 + b, 'hair', 'light'); put(g, 29, 24 + b, 'hair', 'light'); put(g, 35, 24 + b, 'hair', 'light');

    // кепка задом наперёд: купол, ремешок со застёжкой, козырёк виден по бокам
    ellipse(g, 32, 11 + b, 17.6, 9.6, 'cap');
    rect(g, 15, 17 + b, 34, 3, 'cap', 'shade');
    rect(g, 15, 17 + b, 34, 1, 'cap', 'base');
    poly(g, [[13, 15 + b], [16, 15 + b], [17, 20 + b], [13, 19 + b]], 'cap', 'deep');
    poly(g, [[51, 15 + b], [48, 15 + b], [47, 20 + b], [51, 19 + b]], 'cap', 'deep');
    rect(g, 29, 17 + b, 6, 3, 'cap', 'deep');
    rect(g, 30, 18 + b, 4, 1, 'white');
    put(g, 29, 18 + b, 'line'); put(g, 34, 18 + b, 'line');
    rect(g, 32, 3 + b, 1, 13, 'cap', 'shade');
    for (let k = 0; k < 12; k++) {
      put(g, 24 - Math.round(k * 0.2), 4 + k + b, 'cap', 'shade');
      put(g, 41 + Math.round(k * 0.2), 4 + k + b, 'cap', 'shade');
    }
    put(g, 32, 2 + b, 'cap', 'deep'); put(g, 31, 2 + b, 'cap', 'deep');
    // логотип на куполе
    rect(g, 37, 6 + b, 1, 6, 'white'); ellipse(g, 35.6, 12 + b, 1.7, 1.3, 'white');
    put(g, 38, 6 + b, 'white'); put(g, 39, 7 + b, 'white');
    // блик
    put(g, 22, 6 + b, 'cap', 'light'); put(g, 23, 5 + b, 'cap', 'light'); put(g, 21, 8 + b, 'cap', 'light');

    if (thinkArmAfter) { arm(g, J.l, 'l'); arm(g, J.r, 'r'); }

    shade(g);
    outline(g);
    return g;
  }

  const NOTE = ['...##.', '...#.#', '...#..', '...#..', '...#..', '.###..', '####..', '.##...'];
  const SPARK = ['..#..', '..#..', '#####', '..#..', '..#..'];
  function sprite(ctx, bmp, x, y, color) {
    ctx.fillStyle = color;
    for (let j = 0; j < bmp.length; j++) for (let i = 0; i < bmp[j].length; i++) if (bmp[j][i] === '#') ctx.fillRect(x + i, y + j, 1, 1);
  }

  function paint(canvas, g, extras) {
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const r = g.r[y * W + x];
        if (!r) continue;
        const ramp = RAMP[r];
        ctx.fillStyle = ramp[g.t[y * W + x]] || ramp.base;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    if (extras) extras(ctx);
  }

  /**
   * Позы: 'stand' | 'wave' | 'talk' | 'point' | 'think' | 'cheer' | 'groove'.
   * setTalking(true) двигает ртом. groove(мс) включает танец под звук, ноты летят вверх.
   */
  function MashHD(canvas, pose) {
    this.canvas = canvas;
    canvas.style.setProperty('--cw', W);
    canvas.style.setProperty('--ch', H);
    this.pose = pose || 'stand';
    this.talking = false;
    this.step = 0;
    this.blinkUntil = 0; this.nextBlink = 0;
    this.grooveUntil = 0;
    this.reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.render();
    if (!this.reduce) this.timer = setInterval(() => this.tick(), 120);
  }
  MashHD.prototype.setPose = function (p) { this.pose = p; this.render(); };
  MashHD.prototype.setTalking = function (on) { this.talking = !!on; this.render(); };
  MashHD.prototype.groove = function (ms) { this.grooveUntil = Date.now() + (ms || 900); this.render(); };
  MashHD.prototype.tick = function () {
    if (!this.canvas.isConnected || this.canvas.offsetParent === null) return;
    this.step++;
    const now = Date.now();
    if (now > this.nextBlink) { this.blinkUntil = now + 150; this.nextBlink = now + 2000 + Math.random() * 2600; }
    this.render();
  };
  MashHD.prototype.render = function () {
    const now = Date.now(), s = this.step, still = this.reduce;
    const grooving = now < this.grooveUntil;
    const pose = grooving && this.pose !== 'cheer' ? 'groove' : this.pose;
    const o = {
      pose,
      b: still ? 0 : (grooving ? (s % 2) : (Math.floor(s / 4) % 2)),
      sway: still ? 0 : (Math.floor(s / 5) % 2),
      f: { a: still ? false : (pose === 'wave' ? s % 2 === 0 : Math.floor(s / 3) % 2 === 0) },
      eyes: now < this.blinkUntil ? 'closed' : 'open',
      look: [0, 0],
      brows: 'normal',
      mouth: 'smile',
    };
    if (pose === 'cheer') { o.eyes = 'happy'; o.mouth = 'big'; }
    if (pose === 'groove') { o.eyes = 'happy'; o.mouth = 'open'; }
    if (pose === 'point') o.look = [1, 0];
    if (pose === 'think') { o.look = [-1, -1]; o.brows = 'think'; o.mouth = 'o'; }
    if (pose === 'wave') o.mouth = 'open';
    if (this.talking && !still && pose !== 'cheer') {
      o.mouth = ['open', 'closed', 'o', 'open', 'smile', 'closed'][s % 6];
      if (s % 7 === 0) o.brows = 'up';
    }
    const g = drawFigure(o);
    const notes = grooving && !still ? [0, 1, 2].map((k) => ({ x: k % 2 ? 54 : 3, y: 60 - ((s * 2 + k * 14) % 44), c: k === 1 ? '#3A6BFF' : '#FF5C9E' })) : null;
    const sparks = pose === 'cheer' && !still ? [[6, 12], [56, 8], [8, 48], [55, 50]] : null;
    paint(this.canvas, g, (ctx) => {
      if (notes) notes.forEach((n) => sprite(ctx, NOTE, n.x, n.y, n.c));
      if (sparks) sparks.forEach(([x, y], i) => { if ((s + i) % 3) sprite(ctx, SPARK, x, y, '#FFC93C'); });
    });
  };

  root.Mascot = Object.assign(root.Mascot || {}, { MashHD, HD: [W, H] });
})(self);
