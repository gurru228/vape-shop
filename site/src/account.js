// Member accounts (phone or email + password) on the Netlify functions in netlify/functions.
// Stamps live on the server and only move when the shop confirms an order in Telegram; this keeps
// stampStore in sync and owns the sign-in / register / my-account dialog.
function createAccount({ products, onStamps }) {
  const KEY = 'vs3d-session', SEEN = 'vs3d-stamps-seen';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const subs = [];
  const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  let session = read(KEY), orders = [], pollTimer = 0;
  const user = () => session?.user || null;
  const emit = () => subs.forEach(f => f(user()));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const showPhone = d => (/^34\d{9}$/.test(d) ? `+34 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : '+' + d);
  // sessions saved before email sign-up only carry the phone
  const uidOf = u => u?.id || u?.phone;
  const showId = u => (u.email || showPhone(u.phone));

  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch('/api/' + path, {
        method, body: body && JSON.stringify(body),
        headers: { 'content-type': 'application/json', ...(session ? { authorization: 'Bearer ' + session.token } : {}) },
      });
    } catch (e) { throw Object.assign(new Error('连不上服务器，请检查网络后再试'), { offline: true }); }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && session && !['login', 'register'].includes(path)) signedOut();
    if (!res.ok) throw Object.assign(new Error(data.error || '服务器出错了，请稍后再试'), { status: res.status, offline: res.status === 404 && !data.error });
    return data;
  }

  function sync(data) {
    session.user = { id: data.user.id, name: data.user.name, phone: data.user.phone, email: data.user.email, tempPw: !!data.user.tempPw };
    write(KEY, session);
    orders = data.orders || [];
    stampStore.reset(data.user.stamps);
    // what this device has shown, so a confirmation that lands while the site is closed still gets stamped in on the next visit
    write(SEEN, { id: data.user.id, stamps: data.user.stamps });
    poll();
    emit();
  }
  async function refresh() {
    if (!session) return;
    try { sync(await api('me')); } catch (e) { /* offline: keep what we have */ }
  }
  function signedIn(data) {
    session = { token: data.token, user: data.user };
    stampStore.reset(data.user.stamps, true);
    sync(data);
  }
  function signedOut() {
    session = null; orders = [];
    write(KEY, null);
    clearTimeout(pollTimer);
    stampStore.reset({}, true);
    emit();
  }
  // while an order waits for the shop, check back now and then so its stamps land on the open page
  function poll() {
    clearTimeout(pollTimer);
    if (orders.some(o => o.status === 'pending')) pollTimer = setTimeout(() => (document.hidden ? poll() : refresh()), 20000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

  // ---------- dialog ----------
  const wrap = document.createElement('div');
  wrap.className = 'acct';
  wrap.innerHTML = '<div class="acct-box" role="dialog" aria-modal="true" aria-labelledby="acctTitle" tabindex="-1"></div>';
  document.body.appendChild(wrap);
  const box = wrap.firstElementChild;
  let view = 'login', why = '', lastFocus = null, confirmDelete = false, saved = false;

  const field = (id, label, attrs, extra = '') => `<div class="field" data-f="${id}"><label for="a-${id}">${label}</label><div class="a-in"><input id="a-${id}" name="${id}" ${attrs}>${extra}</div></div>`;
  function render() {
    const u = user();
    const why_ = why ? `<p class="acct-why">${esc(why)}</p>` : '';
    const head = (eyebrow, title, sub = '') => `<button type="button" class="acct-x" data-a="close" aria-label="关闭">×</button>
      <span class="acct-eyebrow">${eyebrow}</span><h2 id="acctTitle">${title}</h2>${sub ? `<p class="acct-sub">${sub}</p>` : ''}${why_}`;
    const idField = field('account', '手机号或邮箱', 'type="text" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="612 345 678 / tu@email.com" required');
    const pwField = (auto, ph, id = 'password', label = '密码') => field(id, label, `type="password" autocomplete="${auto}" minlength="6" placeholder="${ph}" required`, '<button type="button" class="a-eye" data-a="eye">显示</button>');
    if (view === 'login') {
      box.innerHTML = `${head('会员 · MIEMBROS', '登录')}
        <form class="acct-form" novalidate>${idField}${pwField('current-password', '')}
          <p class="acct-err" role="alert"></p>
          <button class="btn btn-primary" type="submit">登录</button></form>
        <div class="acct-alt"><button type="button" data-a="register">还没有账户？注册一个</button>
          <a href="/api/wa?text=${encodeURIComponent('你好，我忘记了集章卡账户的密码，想重置一下')}" target="_blank" rel="noopener">忘记密码？WhatsApp 找店家重置</a></div>`;
    } else if (view === 'register') {
      box.innerHTML = `${head('集章卡 · TARJETA DE SELLOS', '注册会员 · 领集章卡', '集章卡绑在账号上，店家确认订单后自动盖章，同一款满 10 送 1。')}
        <form class="acct-form" novalidate>${idField}
          ${field('name', '怎么称呼你', 'autocomplete="nickname" maxlength="40" placeholder="昵称就行" required')}
          ${pwField('new-password', '至少 6 位')}
          <label class="acct-check"><input type="checkbox" name="adult" required><span>我已年满 18 岁 · Soy mayor de 18 años</span></label>
          <p class="acct-err" role="alert"></p>
          <button class="btn btn-primary" type="submit">注册账号并领卡</button>
          <p class="acct-fine">手机号或邮箱只用来登录，不会公开，也不会发广告；随时可以在“我的”里删除账户。</p></form>
        <div class="acct-alt"><button type="button" data-a="login">已经有账户？登录</button></div>`;
    } else if (view === 'password') {
      box.innerHTML = `${head('我的账户', u.tempPw ? '设一个新密码' : '修改密码', u.tempPw ? '你现在用的是店家发的临时密码，换一个自己记得住的。集的章都还在。' : '改完后，其他设备上的登录会退出。')}
        <form class="acct-form" novalidate>
          <input type="text" name="username" autocomplete="username" value="${esc(showId(u))}" hidden>
          ${pwField('current-password', u.tempPw ? '店家发给你的那个' : '', 'current', u.tempPw ? '临时密码' : '现在的密码')}
          ${pwField('new-password', '至少 6 位', 'next', '新密码')}
          <p class="acct-err" role="alert"></p>
          <button class="btn btn-primary" type="submit">保存新密码</button></form>
        <div class="acct-alt"><button type="button" data-a="me">${u.tempPw ? '以后再改' : '返回'}</button></div>`;
    } else {
      const rows = products.map(p => {
        const n = stampStore.get(p.id), full = n >= STAMPS_PER_REWARD;
        return `<div class="am-line${full ? ' full' : ''}"><b>${esc(shortName(p))}</b><span class="dots" aria-hidden="true">${Array.from({ length: STAMPS_PER_REWARD }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span><small class="num">${full ? '满了，下单送 1' + stampUnit(p) : `${n}/${STAMPS_PER_REWARD}`}</small></div>`;
      }).join('');
      const STATUS = { pending: '等店家确认', confirmed: '已确认 · 已盖章', cancelled: '已取消' };
      const list = orders.length ? orders.map(o => `<li><span class="num">${esc(o.no)}</span><small>${new Date(o.created).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} · ${euro(o.total)}</small><em class="st-${o.status}">${STATUS[o.status] || o.status}</em></li>`).join('')
        : '<li class="none">还没有订单</li>';
      box.innerHTML = `${head('我的集章卡', `你好，${esc(u.name)}`, `<span class="num">${esc(showId(u))}</span>`)}
        ${saved ? '<p class="acct-why">✓ 新密码已保存</p>' : u.tempPw ? '<p class="acct-why">你还在用临时密码。<button type="button" class="acct-link" data-a="password">现在改一个 →</button></p>' : ''}
        <div class="am-lines">${rows}</div>
        <div class="am-orders"><span class="acct-eyebrow">最近的订单</span><ul>${list}</ul></div>
        <div class="acct-cta"><button type="button" class="btn btn-primary" data-a="stamps">看集章卡</button><button type="button" class="btn btn-ghost" data-a="logout">退出登录</button></div>
        <div class="acct-alt">${confirmDelete
          ? `<span class="acct-danger">删除后，集的章会一起清空，不能恢复。</span><button type="button" class="danger" data-a="delete!">确定删除账户</button><button type="button" data-a="keep">不删了</button>`
          : '<button type="button" data-a="password">修改密码</button><button type="button" data-a="delete?">删除账户</button>'}</div>`;
    }
  }

  function open(v = user() ? 'me' : 'register', reason = '') {
    view = v; why = reason; confirmDelete = false; saved = false;
    if (!wrap.classList.contains('open')) lastFocus = document.activeElement;
    render();
    wrap.classList.add('open'); lockScroll('account', true);
    (box.querySelector('input') || box).focus({ preventScroll: true });
    if (view === 'me') refresh().then(() => { if (wrap.classList.contains('open') && view === 'me') render(); });
  }
  function close(then) {
    if (!wrap.classList.contains('open')) return;
    wrap.classList.remove('open'); lockScroll('account', false);
    if (then) then(); else lastFocus?.focus?.({ preventScroll: true });
  }

  // shared with the promo poster's inline sign-up
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function check(view, v) {
    const id = v.account.trim();
    if (!id) return ['请填写手机号或邮箱', 'account'];
    if (id.includes('@') ? !EMAIL.test(id) : id.replace(/\D/g, '').length < 9) return [id.includes('@') ? '邮箱格式不对' : '手机号看起来不完整', 'account'];
    if (view === 'register' && !v.name.trim()) return ['请填写怎么称呼你', 'name'];
    if (v.password.length < 6) return ['密码至少 6 位', 'password'];
    if (view === 'register' && !v.adult) return ['需要确认你已满 18 岁', 'adult'];
    return null;
  }
  async function signIn(view, v) {
    try {
      signedIn(await api(view, { method: 'POST', body: { account: v.account.trim(), name: v.name?.trim(), password: v.password, adult: v.adult } }));
    } catch (ex) {
      if (ex.offline) ex.message = '现在连不上服务器，稍后再试，或者先用 WhatsApp 联系我们';
      throw ex;
    }
    return user();
  }

  box.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, err = f.querySelector('.acct-err'), btn = f.querySelector('[type=submit]');
    const say = (msg, name) => { err.textContent = msg; if (name) f.elements[name]?.focus(); };
    if (view === 'password') {
      const current = f.elements.current.value, next = f.elements.next.value;
      if (!current) return say(user().tempPw ? '请填写临时密码' : '请填写现在的密码', 'current');
      if (next.length < 6) return say('新密码至少 6 位', 'next');
      if (next === current) return say('新密码要和原来的不一样', 'next');
      btn.disabled = true; btn.textContent = '保存中…'; err.textContent = '';
      try {
        const data = await api('password', { method: 'POST', body: { current, next } });
        session.token = data.token;
        sync(data);
        open('me'); saved = true; render();
      } catch (ex) {
        say(ex.offline ? '现在连不上服务器，稍后再试' : ex.message, ex.status === 400 && /现在的密码/.test(ex.message) ? 'current' : null);
        btn.disabled = false; btn.textContent = '保存新密码';
      }
      return;
    }
    const v = { account: f.elements.account.value, name: f.elements.name?.value || '', password: f.elements.password.value, adult: f.elements.adult?.checked };
    const bad = check(view, v);
    if (bad) return say(...bad);
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = view === 'login' ? '登录中…' : '注册中…'; err.textContent = '';
    try {
      const u = await signIn(view, v);
      // signed in with the shop's temporary password: go straight on to choosing a new one
      if (u?.tempPw) open('password'); else close();
    } catch (ex) {
      say(ex.message);
      btn.disabled = false; btn.textContent = label;
    }
  });
  box.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'close') close();
    else if (a === 'login' || a === 'register') { const reason = why; open(a, reason); }
    else if (a === 'password' || a === 'me') open(a);
    else if (a === 'eye') {
      const inp = b.previousElementSibling, show = inp.type === 'password';
      inp.type = show ? 'text' : 'password'; b.textContent = show ? '隐藏' : '显示';
    } else if (a === 'stamps') close(onStamps);
    else if (a === 'logout') { api('logout', { method: 'POST' }).catch(() => {}); signedOut(); close(); }
    else if (a === 'delete?' || a === 'keep') { confirmDelete = a === 'delete?'; render(); }
    else if (a === 'delete!') {
      b.disabled = true;
      try { await api('me', { method: 'DELETE' }); write(SEEN, null); signedOut(); close(); } catch (ex) { b.disabled = false; b.textContent = ex.message; }
    }
  });
  box.addEventListener('input', e => { const err = box.querySelector('.acct-err'); if (err && e.target.matches('input')) err.textContent = ''; });
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', e => {
    if (!wrap.classList.contains('open')) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const f = [...box.querySelectorAll('button:not([disabled]), input, a[href]')];
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, true);
  if (REDUCED) wrap.classList.add('still');

  // returning visitor: paint the stamps this device last showed, then let the server's newer count stamp in
  if (session) {
    const seen = read(SEEN);
    stampStore.reset(seen && uidOf(seen) === uidOf(session.user) ? seen.stamps : {}, true);
    refresh();
  }

  return {
    user, api, open, close, refresh, showPhone, showId, check, signIn,
    on(f) { subs.push(f); },
  };
}
