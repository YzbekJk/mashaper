/* Мэшапер: вкладки, аккаунты (Supabase), загрузка мешапов, лента, лайки, комментарии, скачивание. */
(function () {
  'use strict';
  const I = self.I18n;
  const $ = (id) => document.getElementById(id);
  const t = (...a) => I.t(...a);
  const cfg = self.MASHAPER_SUPABASE || {};
  const MAX_AUDIO = 50 * 1024 * 1024, MAX_AVATAR = 2 * 1024 * 1024, PAGE = 12;
  const SDK_URLS = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
    'https://unpkg.com/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
  ];
  const MIME = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', webm: 'audio/webm' };
  const AVATAR_MIME = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1 };

  I.extend({
    ru: {
      tab_match: 'Подгонка', tab_upload: 'Загрузить мешап', tab_listen: 'Мешапы',
      sign_in: 'Войти', sign_up: 'Регистрация', sign_out: 'Выйти',
      email: 'Почта', password: 'Пароль', nickname: 'Ник',
      save: 'Сохранить', close: 'Закрыть', forgot: 'Забыли пароль?',
      auth_in: 'Вход', auth_up: 'Создать аккаунт',
      auth_check_mail: 'Мы отправили письмо со ссылкой для подтверждения. Подтвердите почту и войдите.',
      auth_reset_sent: 'Если такая почта есть, мы отправили на неё письмо для смены пароля.',
      auth_new_pass: 'Новый пароль', auth_pass_saved: 'Пароль изменён.',
      err_nick_len: 'Ник должен быть от 2 до 24 символов.', err_nick_taken: 'Этот ник уже занят.',
      err_email: 'Введите почту.', err_pass: 'Пароль не короче 6 символов.',
      err_invalid: 'Неверная почта или пароль.', err_exists: 'Эта почта уже зарегистрирована.',
      err_unconfirmed: 'Почта не подтверждена. Проверьте письмо.', err_net: 'Не удалось связаться с сервером.',
      err_generic: (m) => 'Ошибка: ' + m,
      cloud_off: 'Облако мешапов пока не подключено: владельцу сайта нужно добавить ключи Supabase в config.js.',
      cloud_fail: 'Не удалось загрузить библиотеку Supabase. Проверьте интернет и обновите страницу.',
      up_title: 'Загрузить мешап', up_gate: 'Чтобы загрузить мешап, войдите в аккаунт.',
      up_as: 'Загружаете как', up_pick: 'Выбрать файл мешапа',
      up_hint: 'Готовый мешап: mp3, wav, ogg, m4a или flac, до 50 МБ. Ниже укажите, из каких песен он сделан.',
      song_gd: 'GD Song', up_submit: 'Загрузить', up_uploading: 'Загружаю…', up_done: 'Мешап загружен!',
      up_go: 'Смотреть мешапы', up_need_file: 'Выберите файл мешапа.',
      up_need_names: 'Заполните оба поля: GD Song и Обычная песня.',
      up_big: 'Файл больше 50 МБ.', up_type: 'Нужен аудиофайл.',
      listen_title: 'Мешапы', sort_new: 'Новые', sort_top: 'Популярные', refresh: 'Обновить',
      more: 'Показать ещё', empty: 'Пока нет мешапов. Загрузите первый!', loading: 'Загружаю…',
      like: 'Нравится', unlike: 'Убрать лайк', need_login_like: 'Войдите, чтобы ставить лайки.',
      comments_n: (n) => 'Комментарии (' + n + ')', comment_ph: 'Напишите комментарий',
      comment_send: 'Отправить', comment_login: 'Войдите, чтобы комментировать.',
      no_comments: 'Комментариев пока нет.', dl: 'Скачать', del: 'Удалить',
      del_confirm: 'Удалить этот мешап вместе с лайками и комментариями?', del_comment: 'Удалить комментарий',
      profile_title: 'Профиль', avatar_change: 'Сменить аватарку', profile_saved: 'Сохранено.',
      avatar_big: 'Аватарка больше 2 МБ.', avatar_type: 'Нужна картинка jpg, png или webp.',
      from: 'из', by: 'Автор',
    },
    en: {
      tab_match: 'Match', tab_upload: 'Upload a mashup', tab_listen: 'Mashups',
      sign_in: 'Sign in', sign_up: 'Sign up', sign_out: 'Sign out',
      email: 'Email', password: 'Password', nickname: 'Nickname',
      save: 'Save', close: 'Close', forgot: 'Forgot your password?',
      auth_in: 'Sign in', auth_up: 'Create an account',
      auth_check_mail: 'We sent you an email with a confirmation link. Confirm your email, then sign in.',
      auth_reset_sent: 'If that email exists, we sent it a message to reset the password.',
      auth_new_pass: 'New password', auth_pass_saved: 'Password changed.',
      err_nick_len: 'The nickname must be 2 to 24 characters.', err_nick_taken: 'That nickname is already taken.',
      err_email: 'Enter your email.', err_pass: 'The password must be at least 6 characters.',
      err_invalid: 'Wrong email or password.', err_exists: 'This email is already registered.',
      err_unconfirmed: 'Email not confirmed. Check your inbox.', err_net: 'Could not reach the server.',
      err_generic: (m) => 'Error: ' + m,
      cloud_off: 'The mashup cloud is not connected yet: the site owner needs to add the Supabase keys to config.js.',
      cloud_fail: 'Could not load the Supabase library. Check your connection and reload the page.',
      up_title: 'Upload a mashup', up_gate: 'Sign in to upload a mashup.',
      up_as: 'Uploading as', up_pick: 'Choose the mashup file',
      up_hint: 'A finished mashup: mp3, wav, ogg, m4a or flac, up to 50 MB. Below, say which songs it is made from.',
      song_gd: 'GD Song', up_submit: 'Upload', up_uploading: 'Uploading…', up_done: 'Mashup uploaded!',
      up_go: 'View mashups', up_need_file: 'Choose the mashup file.',
      up_need_names: 'Fill in both fields: GD Song and Regular song.',
      up_big: 'The file is larger than 50 MB.', up_type: 'An audio file is required.',
      listen_title: 'Mashups', sort_new: 'Newest', sort_top: 'Popular', refresh: 'Refresh',
      more: 'Show more', empty: 'No mashups yet. Upload the first one!', loading: 'Loading…',
      like: 'Like', unlike: 'Remove like', need_login_like: 'Sign in to like mashups.',
      comments_n: (n) => 'Comments (' + n + ')', comment_ph: 'Write a comment',
      comment_send: 'Send', comment_login: 'Sign in to comment.',
      no_comments: 'No comments yet.', dl: 'Download', del: 'Delete',
      del_confirm: 'Delete this mashup together with its likes and comments?', del_comment: 'Delete comment',
      profile_title: 'Profile', avatar_change: 'Change avatar', profile_saved: 'Saved.',
      avatar_big: 'The avatar is larger than 2 MB.', avatar_type: 'A jpg, png or webp image is required.',
      from: 'from', by: 'By',
    },
  });

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  // ---------- состояние ----------
  const configured = !!(cfg.url && cfg.anonKey);
  let sb = null, sdkFailed = false;
  let me = null, profile = null;
  const feed = { items: [], loaded: false, done: false, loading: false, sort: 'new' };
  let current = 'match';

  // ---------- вкладки ----------
  const TABS = ['match', 'upload', 'listen'];
  function showTab(name, fromHash) {
    if (TABS.indexOf(name) < 0) name = 'match';
    current = name;
    TABS.forEach((n) => {
      const on = n === name;
      $('tab-' + n).hidden = !on;
      const b = $('tabbtn-' + n);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    if (!fromHash) {
      try { history.replaceState(null, '', name === 'match' ? location.pathname + location.search : '#' + name); } catch (e) { /* ок */ }
    }
    if (name === 'listen' && !feed.loaded && sb) loadFeed(true);
    if (name === 'upload') renderUpload();
    if (name === 'listen') renderFeedGate();
  }
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('tabbtn-match').parentElement.addEventListener('keydown', (e) => {
    const i = TABS.indexOf(current);
    let n = null;
    if (e.key === 'ArrowRight') n = TABS[(i + 1) % TABS.length];
    else if (e.key === 'ArrowLeft') n = TABS[(i + TABS.length - 1) % TABS.length];
    if (n) { e.preventDefault(); showTab(n); $('tabbtn-' + n).focus(); }
  });
  window.addEventListener('hashchange', () => showTab(location.hash.replace('#', ''), true));

  // ---------- аватарки ----------
  function colorFor(name) {
    let x = 0;
    for (let i = 0; i < name.length; i++) x = (x * 31 + name.charCodeAt(i)) % 360;
    return 'hsl(' + x + ' 55% 42%)';
  }
  function avatarEl(nick, url, cls) {
    const w = h('span', 'avatar' + (cls ? ' ' + cls : ''));
    w.setAttribute('aria-hidden', 'true');
    if (url) {
      const img = document.createElement('img');
      img.src = url; img.alt = ''; img.loading = 'lazy';
      img.addEventListener('error', () => { img.remove(); w.textContent = (nick || '?').charAt(0).toUpperCase(); w.style.background = colorFor(nick || '?'); });
      w.appendChild(img);
    } else {
      w.textContent = (nick || '?').charAt(0).toUpperCase();
      w.style.background = colorFor(nick || '?');
    }
    return w;
  }
  function fmtDate(s) {
    try { return new Date(s).toLocaleDateString(I.lang === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; }
  }
  function fmtDur(sec) {
    if (!(sec > 0)) return '';
    return Math.floor(sec / 60) + ':' + String(Math.round(sec % 60)).padStart(2, '0');
  }
  function mapErr(e) {
    const m = String((e && e.message) || e || '').toLowerCase();
    if (m.indexOf('invalid login') >= 0) return t('err_invalid');
    if (m.indexOf('already registered') >= 0 || m.indexOf('already been registered') >= 0) return t('err_exists');
    if (m.indexOf('not confirmed') >= 0) return t('err_unconfirmed');
    if (m.indexOf('password should') >= 0 || m.indexOf('at least 6') >= 0) return t('err_pass');
    if (m.indexOf('failed to fetch') >= 0 || m.indexOf('network') >= 0) return t('err_net');
    return t('err_generic', (e && e.message) || String(e));
  }

  // ---------- загрузка библиотеки и старт ----------
  function loadSdk() {
    function tryLoad(i) {
      return new Promise((resolve, reject) => {
        if (self.supabase && self.supabase.createClient) { resolve(); return; }
        const s = document.createElement('script');
        s.src = SDK_URLS[i]; s.async = true;
        s.onload = () => (self.supabase && self.supabase.createClient ? resolve() : reject(new Error('no sdk')));
        s.onerror = () => reject(new Error('sdk load failed'));
        document.head.appendChild(s);
      }).catch((e) => { if (i + 1 < SDK_URLS.length) return tryLoad(i + 1); throw e; });
    }
    return tryLoad(0);
  }

  function notice(el, text, withLogin) {
    el.textContent = '';
    el.appendChild(h('p', '', text));
    if (withLogin) {
      const b = h('button', 'btn', t('sign_in'));
      b.type = 'button';
      b.addEventListener('click', () => openAuth('in'));
      el.appendChild(b);
    }
    el.hidden = false;
  }
  function cloudProblem() {
    if (!configured) return t('cloud_off');
    if (sdkFailed) return t('cloud_fail');
    return null;
  }

  async function fetchProfile() {
    if (!me) { profile = null; return; }
    for (let i = 0; i < 4; i++) {
      const { data } = await sb.from('profiles').select('id,nickname,avatar_url').eq('id', me.id).maybeSingle();
      if (data) { profile = data; return; }
      await new Promise((r) => setTimeout(r, 400));
    }
    profile = { id: me.id, nickname: (me.email || '?').split('@')[0], avatar_url: null };
  }

  async function setUser(user) {
    const changed = (me && me.id) !== (user && user.id);
    me = user || null;
    await fetchProfile();
    renderAccount();
    renderUpload();
    if (changed && feed.loaded) loadFeed(true);
    renderFeedGate();
  }

  async function init() {
    renderAccount();
    renderUpload();
    renderFeedGate();
    if (!configured) return;
    try { await loadSdk(); } catch (e) { sdkFailed = true; renderUpload(); renderFeedGate(); return; }
    sb = self.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    sb.auth.onAuthStateChange((evt, session) => {
      setTimeout(() => {
        if (evt === 'PASSWORD_RECOVERY') openRecovery();
        if (evt === 'INITIAL_SESSION' || evt === 'SIGNED_IN' || evt === 'SIGNED_OUT' || evt === 'USER_UPDATED') setUser(session && session.user);
      }, 0);
    });
    const { data } = await sb.auth.getSession();
    if (!me && data && data.session) await setUser(data.session.user);
    else renderAccount();
    showTab(location.hash.replace('#', ''), true);
  }

  // ---------- аккаунт в шапке ----------
  function renderAccount() {
    const b = $('account');
    if (!configured) { b.hidden = true; return; }
    b.hidden = false;
    b.textContent = '';
    if (me && profile) {
      b.classList.add('signed');
      b.appendChild(avatarEl(profile.nickname, profile.avatar_url, 'xs'));
      b.appendChild(h('span', 'acc-name', profile.nickname));
      b.setAttribute('aria-label', t('profile_title') + ': ' + profile.nickname);
    } else {
      b.classList.remove('signed');
      b.textContent = t('sign_in');
      b.removeAttribute('aria-label');
    }
  }
  $('account').addEventListener('click', () => { if (!sb) return; if (me && profile) openProfile(); else openAuth('in'); });

  // ---------- диалоги ----------
  const dlg = $('dlg');
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  function openDialog(build) {
    dlg.textContent = '';
    const body = h('div', 'dlg-body');
    build(body);
    dlg.appendChild(body);
    if (!dlg.open) dlg.showModal();
    const f = body.querySelector('input,button');
    if (f) f.focus();
  }
  function closeBtn() {
    const b = h('button', 'link', t('close'));
    b.type = 'button';
    b.addEventListener('click', () => dlg.close());
    return b;
  }
  function field(label, input) {
    const f = h('div', 'field');
    const l = h('label', '', label);
    input.id = input.id || 'f' + Math.random().toString(36).slice(2, 8);
    l.htmlFor = input.id;
    f.appendChild(l); f.appendChild(input);
    return f;
  }
  function input(type, attrs) {
    const i = document.createElement('input');
    i.type = type;
    Object.keys(attrs || {}).forEach((k) => i.setAttribute(k, attrs[k]));
    return i;
  }

  function openAuth(mode) {
    openDialog((body) => {
      let m = mode || 'in';
      const seg = h('div', 'seg');
      const bIn = h('button', '', t('sign_in')), bUp = h('button', '', t('sign_up'));
      bIn.type = 'button'; bUp.type = 'button';
      seg.appendChild(bIn); seg.appendChild(bUp);
      const form = h('form', 'dlg-form');
      form.noValidate = true;
      const email = input('email', { autocomplete: 'email', inputmode: 'email' });
      const nick = input('text', { maxlength: '24', autocomplete: 'nickname' });
      const pass = input('password', { autocomplete: 'current-password' });
      const nickF = field(t('nickname'), nick);
      form.appendChild(field(t('email'), email));
      form.appendChild(nickF);
      form.appendChild(field(t('password'), pass));
      const msg = h('p', 'status', '');
      msg.setAttribute('role', 'alert');
      const submit = h('button', 'primary');
      submit.type = 'submit';
      const forgot = h('button', 'link', t('forgot'));
      forgot.type = 'button';
      form.appendChild(submit); form.appendChild(msg); form.appendChild(forgot);
      function setMode(x) {
        m = x;
        bIn.setAttribute('aria-pressed', String(x === 'in'));
        bUp.setAttribute('aria-pressed', String(x === 'up'));
        nickF.hidden = x !== 'up';
        forgot.hidden = x !== 'in';
        submit.textContent = x === 'in' ? t('sign_in') : t('auth_up');
        pass.autocomplete = x === 'in' ? 'current-password' : 'new-password';
        msg.textContent = ''; msg.classList.remove('ok', 'bad');
      }
      function say(text, ok) { msg.textContent = text; msg.classList.toggle('ok', !!ok); msg.classList.toggle('bad', !ok); }
      bIn.addEventListener('click', () => setMode('in'));
      bUp.addEventListener('click', () => setMode('up'));
      forgot.addEventListener('click', async () => {
        if (!email.value.trim()) { say(t('err_email')); return; }
        const { error } = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname });
        say(error ? mapErr(error) : t('auth_reset_sent'), !error);
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const em = email.value.trim(), pw = pass.value, nk = nick.value.trim();
        if (!em) { say(t('err_email')); return; }
        if (pw.length < 6) { say(t('err_pass')); return; }
        submit.disabled = true;
        try {
          if (m === 'in') {
            const { error } = await sb.auth.signInWithPassword({ email: em, password: pw });
            if (error) { say(mapErr(error)); return; }
            dlg.close();
          } else {
            if (nk.length < 2 || nk.length > 24) { say(t('err_nick_len')); return; }
            const free = await sb.rpc('nickname_available', { n: nk });
            if (free && free.data === false) { say(t('err_nick_taken')); return; }
            const { data, error } = await sb.auth.signUp({ email: em, password: pw, options: { data: { nickname: nk }, emailRedirectTo: location.origin + location.pathname } });
            if (error) { say(mapErr(error)); return; }
            if (data && data.session) dlg.close(); else say(t('auth_check_mail'), true);
          }
        } catch (err) { say(mapErr(err)); } finally { submit.disabled = false; }
      });
      body.appendChild(h('h2', '', t('sign_in') + ' / ' + t('sign_up')));
      body.appendChild(seg); body.appendChild(form); body.appendChild(closeBtn());
      setMode(m);
    });
  }

  function openRecovery() {
    openDialog((body) => {
      const form = h('form', 'dlg-form');
      const pass = input('password', { autocomplete: 'new-password' });
      form.appendChild(field(t('auth_new_pass'), pass));
      const ok = h('button', 'primary', t('save'));
      ok.type = 'submit';
      const msg = h('p', 'status', '');
      form.appendChild(ok); form.appendChild(msg);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (pass.value.length < 6) { msg.textContent = t('err_pass'); msg.className = 'status bad'; return; }
        const { error } = await sb.auth.updateUser({ password: pass.value });
        msg.textContent = error ? mapErr(error) : t('auth_pass_saved');
        msg.className = 'status ' + (error ? 'bad' : 'ok');
      });
      body.appendChild(h('h2', '', t('auth_new_pass')));
      body.appendChild(form); body.appendChild(closeBtn());
    });
  }

  function openProfile() {
    openDialog((body) => {
      const head = h('div', 'prof-head');
      let av = avatarEl(profile.nickname, profile.avatar_url, 'lg');
      head.appendChild(av);
      const file = input('file', { accept: 'image/jpeg,image/png,image/webp' });
      file.hidden = true;
      const pick = h('button', 'btn small', t('avatar_change'));
      pick.type = 'button';
      pick.addEventListener('click', () => file.click());
      head.appendChild(pick); head.appendChild(file);
      const nick = input('text', { maxlength: '24' });
      nick.value = profile.nickname;
      const msg = h('p', 'status', '');
      msg.setAttribute('role', 'status');
      function say(text, ok) { msg.textContent = text; msg.className = 'status ' + (ok ? 'ok' : 'bad'); }
      file.addEventListener('change', async () => {
        const f = file.files[0];
        if (!f) return;
        if (!AVATAR_MIME[f.type]) { say(t('avatar_type')); return; }
        if (f.size > MAX_AVATAR) { say(t('avatar_big')); return; }
        try {
          const path = me.id + '/avatar';
          const up = await sb.storage.from('avatars').upload(path, f, { upsert: true, contentType: f.type, cacheControl: '3600' });
          if (up.error) throw up.error;
          const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
          const r = await sb.from('profiles').update({ avatar_url: url }).eq('id', me.id);
          if (r.error) throw r.error;
          profile.avatar_url = url;
          const na = avatarEl(profile.nickname, url, 'lg');
          head.replaceChild(na, av); av = na;
          renderAccount(); say(t('profile_saved'), true);
          if (feed.loaded) loadFeed(true);
        } catch (err) { say(mapErr(err)); }
      });
      const save = h('button', 'primary', t('save'));
      save.type = 'button';
      save.addEventListener('click', async () => {
        const nk = nick.value.trim();
        if (nk.length < 2 || nk.length > 24) { say(t('err_nick_len')); return; }
        if (nk === profile.nickname) { say(t('profile_saved'), true); return; }
        try {
          const free = await sb.rpc('nickname_available', { n: nk });
          if (free && free.data === false) { say(t('err_nick_taken')); return; }
          const r = await sb.from('profiles').update({ nickname: nk }).eq('id', me.id);
          if (r.error) throw r.error;
          profile.nickname = nk;
          renderAccount(); renderUpload(); say(t('profile_saved'), true);
          if (feed.loaded) loadFeed(true);
        } catch (err) { say(mapErr(err)); }
      });
      const out = h('button', 'btn', t('sign_out'));
      out.type = 'button';
      out.addEventListener('click', async () => { await sb.auth.signOut(); dlg.close(); });
      body.appendChild(h('h2', '', t('profile_title')));
      body.appendChild(head);
      body.appendChild(field(t('nickname'), nick));
      body.appendChild(save); body.appendChild(msg);
      const row = h('div', 'dlg-row');
      row.appendChild(out); row.appendChild(closeBtn());
      body.appendChild(row);
    });
  }

  // ---------- загрузка мешапа ----------
  const upForm = $('up-form'), upGate = $('up-gate');
  let upFile = null;
  function renderUpload() {
    const problem = cloudProblem();
    if (problem) { notice(upGate, problem); upForm.hidden = true; return; }
    if (!sb) { upGate.hidden = true; upForm.hidden = true; return; }
    if (!me || !profile) { notice(upGate, t('up_gate'), true); upForm.hidden = true; return; }
    upGate.hidden = true; upForm.hidden = false;
    const as = $('up-as');
    as.textContent = '';
    as.appendChild(h('span', 'muted', t('up_as') + ' '));
    as.appendChild(avatarEl(profile.nickname, profile.avatar_url, 'xs'));
    as.appendChild(h('strong', '', ' ' + profile.nickname));
  }
  $('up-file').addEventListener('change', () => {
    upFile = $('up-file').files[0] || null;
    $('up-file-name').removeAttribute('data-i18n');
    $('up-file-name').textContent = upFile ? upFile.name : t('up_pick');
    $('up-file-name').parentElement.classList.toggle('has-file', !!upFile);
    if (!upFile) $('up-file-name').setAttribute('data-i18n', 'up_pick');
  });
  function upSay(text, kind) { const s = $('up-status'); s.textContent = text; s.className = 'status' + (kind ? ' ' + kind : ''); }
  function audioDuration(file) {
    return new Promise((resolve) => {
      const a = new Audio();
      const url = URL.createObjectURL(file);
      const done = (v) => { URL.revokeObjectURL(url); resolve(v); };
      const timer = setTimeout(() => done(null), 4000);
      a.preload = 'metadata';
      a.onloadedmetadata = () => { clearTimeout(timer); done(isFinite(a.duration) ? Math.round(a.duration) : null); };
      a.onerror = () => { clearTimeout(timer); done(null); };
      a.src = url;
    });
  }
  upForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const gd = $('up-gd').value.trim(), reg = $('up-reg').value.trim();
    if (!upFile) { upSay(t('up_need_file'), 'bad'); return; }
    const ext = (upFile.name.split('.').pop() || '').toLowerCase();
    if (!(upFile.type.indexOf('audio/') === 0 || MIME[ext])) { upSay(t('up_type'), 'bad'); return; }
    if (upFile.size > MAX_AUDIO) { upSay(t('up_big'), 'bad'); return; }
    if (!gd || !reg) { upSay(t('up_need_names'), 'bad'); return; }
    $('up-submit').disabled = true;
    upSay(t('up_uploading'));
    let path = null;
    try {
      const dur = await audioDuration(upFile);
      const safeExt = MIME[ext] ? ext : 'mp3';
      path = me.id + '/' + (self.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) + '.' + safeExt;
      const up = await sb.storage.from('mashups').upload(path, upFile, { contentType: MIME[ext] || upFile.type || 'audio/mpeg', cacheControl: '31536000' });
      if (up.error) throw up.error;
      const title = (gd + ' × ' + reg).slice(0, 80);
      const ins = await sb.from('mashups').insert({ user_id: me.id, title, gd_song: gd, regular_song: reg, audio_path: path, audio_name: upFile.name.slice(0, 120), duration_sec: dur });
      if (ins.error) { await sb.storage.from('mashups').remove([path]); throw ins.error; }
      upSay(t('up_done'), 'ok');
      $('up-go').hidden = false;
      feed.loaded = false;
      upFile = null; $('up-file').value = ''; $('up-gd').value = ''; $('up-reg').value = '';
      $('up-file-name').setAttribute('data-i18n', 'up_pick');
      $('up-file-name').textContent = t('up_pick');
      $('up-file-name').parentElement.classList.remove('has-file');
    } catch (err) { upSay(mapErr(err), 'bad'); } finally { $('up-submit').disabled = false; }
  });
  $('up-go').addEventListener('click', () => { $('up-go').hidden = true; upSay(''); showTab('listen'); });

  // ---------- лента ----------
  function renderFeedGate() {
    const g = $('feed-gate');
    const problem = cloudProblem();
    if (problem) { notice(g, problem); $('feed').textContent = ''; $('feed-more').hidden = true; $('feed-status').textContent = ''; return; }
    g.hidden = true;
  }
  function fsay(text, bad) { const s = $('feed-status'); s.textContent = text || ''; s.className = 'status' + (bad ? ' bad' : ''); }

  async function loadFeed(reset) {
    if (!sb || feed.loading) return;
    feed.loading = true;
    if (reset) { feed.items = []; feed.done = false; $('feed').textContent = ''; }
    fsay(t('loading'));
    $('feed-more').hidden = true;
    try {
      let q = sb.from('mashup_feed').select('id,user_id,title,gd_song,regular_song,audio_path,audio_name,duration_sec,created_at,nickname,avatar_url,likes_count,comments_count');
      q = feed.sort === 'top' ? q.order('likes_count', { ascending: false }).order('created_at', { ascending: false }) : q.order('created_at', { ascending: false });
      const off = feed.items.length;
      const { data, error } = await q.range(off, off + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      let liked = {};
      if (me && rows.length) {
        const r = await sb.from('likes').select('mashup_id').eq('user_id', me.id).in('mashup_id', rows.map((x) => x.id));
        (r.data || []).forEach((x) => { liked[x.mashup_id] = true; });
      }
      rows.forEach((x) => { x.liked = !!liked[x.id]; x.comments = null; feed.items.push(x); $('feed').appendChild(cardEl(x)); });
      feed.done = rows.length < PAGE;
      feed.loaded = true;
      fsay(feed.items.length ? '' : t('empty'));
    } catch (err) { fsay(mapErr(err), true); } finally { feed.loading = false; }
    $('feed-more').hidden = feed.done || !feed.items.length;
  }
  $('feed-more').addEventListener('click', () => loadFeed(false));
  $('feed-refresh').addEventListener('click', () => loadFeed(true));
  $('feed-sort').addEventListener('change', () => { feed.sort = $('feed-sort').value; loadFeed(true); });

  function fileUrl(path, dlName) {
    const st = sb.storage.from('mashups');
    return dlName ? st.getPublicUrl(path, { download: dlName }).data.publicUrl : st.getPublicUrl(path).data.publicUrl;
  }
  function safeName(s) { return s.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 100); }

  function cardEl(m) {
    const card = h('article', 'mcard');
    // автор
    const top = h('div', 'mcard-top');
    top.appendChild(avatarEl(m.nickname, m.avatar_url, 'md'));
    const who = h('div', 'who');
    who.appendChild(h('strong', 'nick', m.nickname));
    who.appendChild(h('span', 'when', fmtDate(m.created_at) + (m.duration_sec ? ' · ' + fmtDur(m.duration_sec) : '')));
    top.appendChild(who);
    card.appendChild(top);
    // песни
    const songs = h('dl', 'songs-used');
    [['song_gd', m.gd_song], ['label_reg', m.regular_song]].forEach(([k, v]) => {
      const row = h('div', '');
      row.appendChild(h('dt', '', t(k)));
      row.appendChild(h('dd', '', v));
      songs.appendChild(row);
    });
    card.appendChild(songs);
    // плеер
    const audio = document.createElement('audio');
    audio.controls = true; audio.preload = 'none'; audio.src = fileUrl(m.audio_path);
    audio.addEventListener('play', () => {
      document.querySelectorAll('#feed audio').forEach((a) => { if (a !== audio) a.pause(); });
    });
    card.appendChild(audio);
    // действия
    const acts = h('div', 'mcard-actions');
    const like = h('button', 'btn small like');
    like.type = 'button';
    function paintLike() {
      like.textContent = '';
      like.appendChild(h('span', 'heart', m.liked ? '♥' : '♡'));
      like.appendChild(h('span', '', ' ' + m.likes_count));
      like.setAttribute('aria-pressed', String(m.liked));
      like.setAttribute('aria-label', (m.liked ? t('unlike') : t('like')) + ', ' + m.likes_count);
    }
    paintLike();
    like.addEventListener('click', async () => {
      if (!me) { fsay(t('need_login_like'), true); openAuth('in'); return; }
      const was = m.liked;
      m.liked = !was; m.likes_count += was ? -1 : 1; paintLike();
      const r = was
        ? await sb.from('likes').delete().match({ mashup_id: m.id, user_id: me.id })
        : await sb.from('likes').insert({ mashup_id: m.id, user_id: me.id });
      if (r.error) { m.liked = was; m.likes_count += was ? 1 : -1; paintLike(); fsay(mapErr(r.error), true); }
    });
    const cBtn = h('button', 'btn small');
    cBtn.type = 'button';
    cBtn.setAttribute('aria-expanded', 'false');
    const dl = h('a', 'btn small', t('dl'));
    const ext = (m.audio_path.split('.').pop() || 'mp3');
    dl.href = fileUrl(m.audio_path, safeName(m.title) + '.' + ext);
    dl.setAttribute('download', '');
    acts.appendChild(like); acts.appendChild(cBtn); acts.appendChild(dl);
    if (me && me.id === m.user_id) {
      const del = h('button', 'btn small danger', t('del'));
      del.type = 'button';
      del.addEventListener('click', async () => {
        if (!confirm(t('del_confirm'))) return;
        const r = await sb.from('mashups').delete().eq('id', m.id);
        if (r.error) { fsay(mapErr(r.error), true); return; }
        sb.storage.from('mashups').remove([m.audio_path]);
        audio.pause();
        card.remove();
        feed.items = feed.items.filter((x) => x.id !== m.id);
        if (!feed.items.length) fsay(t('empty'));
      });
      acts.appendChild(del);
    }
    card.appendChild(acts);
    // комментарии
    const cbox = h('div', 'comments');
    cbox.hidden = true;
    const clist = h('ul', 'clist');
    const cform = h('form', 'cform');
    cform.noValidate = true;
    const cin = input('text', { maxlength: '500', placeholder: t('comment_ph'), 'aria-label': t('comment_ph'), autocomplete: 'off' });
    const csend = h('button', 'btn small', t('comment_send'));
    csend.type = 'submit';
    const clogin = h('p', 'hint', t('comment_login'));
    cform.appendChild(cin); cform.appendChild(csend);
    cbox.appendChild(clist); cbox.appendChild(cform); cbox.appendChild(clogin);
    card.appendChild(cbox);
    function paintC() { cBtn.textContent = t('comments_n', m.comments_count); }
    paintC();
    function paintComments() {
      clist.textContent = '';
      if (!m.comments.length) clist.appendChild(h('li', 'empty', t('no_comments')));
      m.comments.forEach((c) => {
        const li = h('li', 'comment');
        const pr = c.profiles || {};
        li.appendChild(avatarEl(pr.nickname, pr.avatar_url, 'sm'));
        const bodyEl = h('div', 'cbody');
        const meta = h('div', 'cmeta');
        meta.appendChild(h('strong', '', pr.nickname || '?'));
        meta.appendChild(h('span', 'when', ' ' + fmtDate(c.created_at)));
        bodyEl.appendChild(meta);
        bodyEl.appendChild(h('p', 'ctext', c.body));
        li.appendChild(bodyEl);
        if (me && (me.id === c.user_id || me.id === m.user_id)) {
          const x = h('button', 'link', '✕');
          x.type = 'button';
          x.setAttribute('aria-label', t('del_comment'));
          x.addEventListener('click', async () => {
            const r = await sb.from('comments').delete().eq('id', c.id);
            if (r.error) { fsay(mapErr(r.error), true); return; }
            m.comments = m.comments.filter((y) => y.id !== c.id);
            m.comments_count = Math.max(0, m.comments_count - 1);
            paintC(); paintComments();
          });
          li.appendChild(x);
        }
        clist.appendChild(li);
      });
      cform.hidden = !me; clogin.hidden = !!me;
    }
    cBtn.addEventListener('click', async () => {
      const open = cbox.hidden;
      cbox.hidden = !open;
      cBtn.setAttribute('aria-expanded', String(open));
      if (open && m.comments === null) {
        clist.textContent = t('loading');
        const r = await sb.from('comments').select('id,user_id,body,created_at,profiles(nickname,avatar_url)').eq('mashup_id', m.id).order('created_at', { ascending: true }).limit(200);
        if (r.error) { clist.textContent = mapErr(r.error); return; }
        m.comments = r.data || [];
        m.comments_count = Math.max(m.comments_count, m.comments.length);
        paintC();
      }
      if (open) paintComments();
    });
    cform.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = cin.value.trim();
      if (!text || !me) return;
      csend.disabled = true;
      const r = await sb.from('comments').insert({ mashup_id: m.id, user_id: me.id, body: text }).select('id,user_id,body,created_at').single();
      csend.disabled = false;
      if (r.error) { fsay(mapErr(r.error), true); return; }
      r.data.profiles = { nickname: profile.nickname, avatar_url: profile.avatar_url };
      m.comments.push(r.data);
      m.comments_count += 1;
      cin.value = '';
      paintC(); paintComments();
    });
    return card;
  }

  // ---------- смена языка ----------
  window.addEventListener('langchange', () => {
    renderAccount(); renderUpload(); renderFeedGate();
    if (feed.loaded) {
      const items = feed.items;
      $('feed').textContent = '';
      items.forEach((x) => $('feed').appendChild(cardEl(x)));
      fsay(items.length ? '' : t('empty'));
    }
    if (dlg.open) dlg.close();
  });

  // ---------- старт ----------
  const startTab = location.hash.replace('#', '');
  if (TABS.indexOf(startTab) > 0) showTab(startTab, true);
  init();
})();
