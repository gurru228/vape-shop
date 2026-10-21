// Cart + checkout: one side panel with three steps (cart → pickup details → done).
// Delivery needs ≥5 items; post is €9.99, free over €150. Orders go to /api/order, which pings the shop on Telegram.
// Members earn a stamp per item once the shop confirms (stamps.js); a full card adds one free unit of that line to the next order.
// Guests can order too, without stamps. If the server can't be reached the order goes out by WhatsApp instead.
function createCheckout({ products, account, onCount, onStamps }) {
  const $ = id => document.getElementById(id);
  const panel = $('cp'), body = $('cpBody'), foot = $('cpFoot'), scrim = $('scrim');
  const WA = '34697332407';
  const MODES = {
    pickup: { name: '自取', es: 'Recogida', note: 'Metro El Capricho' },
    delivery: { name: '外送', es: 'Entrega', note: '马德里当天送达 · 满 5 件' },
    postal: { name: '邮寄', es: 'Correo', note: '€9.99 · 满 €150 包邮' },
  };
  const SLOTS = ['10:00–14:00', '14:00–18:00', '18:00–21:00'];

  let items = [];
  try { items = JSON.parse(localStorage.getItem('vs3d-cart') || '[]'); } catch (e) { items = []; }
  const form = { name: '', phone: '', mode: 'pickup', slot: SLOTS[0], recipient: '', street: '', floor: '', cp: '', city: '', province: '', country: 'ES', coupon: '' };
  let step = 0, lastFocus = null, order = null, sending = false;

  const product = id => products.find(p => p.id === id);
  const flavorOf = it => product(it.pid).flavors.find(f => f.name === it.flavor) || product(it.pid).flavors[0];
  const count = () => items.reduce((n, it) => n + it.qty, 0);
  const subtotal = () => items.reduce((s, it) => s + product(it.pid).price * it.qty, 0);
  const shipping = sub => (form.mode === 'postal' && !(form.country === 'ES' && sub >= 150) ? 9.99 : 0);
  // stamp cards: every full card puts one free unit of its own line into the order; the buyer picks the flavor
  const giftPick = {};
  const inStock = p => p.flavors.filter(f => !stock.out(p.id, f.name));
  const giftFlavor = p => inStock(p).find(f => f.name === giftPick[p.id])
    || inStock(p).find(f => items.some(it => it.pid === p.id && it.flavor === f.name)) || inStock(p)[0] || p.flavors[0];
  const totals = () => {
    const sub = subtotal(), ship = shipping(sub);
    const gifts = items.length ? products.filter(p => stampStore.get(p.id) >= STAMPS_PER_REWARD).map(p => ({ p, f: giftFlavor(p) })) : [];
    const earn = {};
    items.forEach(it => { earn[it.pid] = (earn[it.pid] || 0) + it.qty; });
    return { sub, ship, total: sub + ship, gifts, earn };
  };
  // the lines a customer sees cards for: bought in this order, or holding a reward
  const cardLines = t => products.filter(p => t.earn[p.id] || t.gifts.some(g => g.p === p));
  const save = () => {
    try { localStorage.setItem('vs3d-cart', JSON.stringify(items)); } catch (e) { /* private mode */ }
    onCount(count());
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function add(p, flavor, qty) {
    const hit = items.find(it => it.pid === p.id && it.flavor === flavor.name);
    if (hit) hit.qty = Math.min(20, hit.qty + qty); else items.push({ pid: p.id, flavor: flavor.name, qty });
    save();
    if (panel.classList.contains('open') && step === 0) render();
  }

  // ---------- step 1: cart ----------
  // one row per card: ten dots, stamps already on it, then the ones this order will add
  function stampBar(t) {
    if (!account.user()) {
      const n = Object.values(t.earn).reduce((a, b) => a + b, 0);
      return `<div class="stampbar guest"><span class="sb-h">这单能盖 ${n} 个章</span><small>注册会员后，店家确认订单就自动盖到你的集章卡上。同一款满 10 个章送 1 支。</small>
        <div class="sb-act"><button type="button" class="btn btn-primary" data-act="join">注册领卡</button><button type="button" class="link" data-act="signin">已有账户，登录</button></div></div>`;
    }
    const rows = cardLines(t).map(p => {
      const gift = t.gifts.some(g => g.p === p), unit = stampUnit(p), earn = t.earn[p.id] || 0;
      const have = stampStore.get(p.id) - (gift ? STAMPS_PER_REWARD : 0), after = have + earn;
      const dots = Array.from({ length: STAMPS_PER_REWARD }, (_, i) =>
        `<i class="${i < have ? 'on' : i < after ? 'new' : ''}"></i>`).join('');
      const msg = after >= STAMPS_PER_REWARD ? `确认后盖 ${earn} 个，集满了，下一单送 1 ${unit}`
        : earn ? `确认后盖 ${earn} 个，再 ${STAMPS_PER_REWARD - after} ${unit}送 1 ${unit}` : `再 ${STAMPS_PER_REWARD - after} ${unit}送 1 ${unit}`;
      return `<div class="sb-row"><b>${esc(shortName(p))}</b><small>${gift ? `卡满了，这单送 1 ${unit} · ` : ''}${msg}</small><div class="dots" aria-hidden="true">${dots}</div></div>`;
    }).join('');
    return `<div class="stampbar"><span class="sb-h">${esc(account.user().name)} 的集章卡 · 每款满 10 送 1 同款</span>${rows}</div>`;
  }
  function giftLines(t) {
    return t.gifts.map(({ p, f }) => `<div class="line gift">
      <img src="${imgSrc(f.image)}" alt="">
      <div><b>赠品 · ${esc(shortName(p))}</b><small>集章卡满 10 送 1 ${stampUnit(p)}</small>
        <select data-gift="${p.id}" aria-label="${esc(shortName(p))} 赠品口味">${inStock(p).map(g => `<option value="${esc(g.name)}"${g === f ? ' selected' : ''}>${esc(g.nameCn)} · ${esc(g.name)}</option>`).join('')}</select></div>
      <div class="r"><s class="num">${euro(p.price)}</s><b class="free">免费</b></div>
    </div>`).join('');
  }
  function renderCart() {
    if (!items.length) {
      body.innerHTML = `<div class="empty"><b>购物车是空的</b><span>先去挑一支吧</span></div>`;
      foot.innerHTML = `<button type="button" class="btn btn-ghost" data-act="close">继续逛逛</button>`;
      return;
    }
    const t = totals();
    body.innerHTML = stampBar(t) + items.map((it, i) => {
      const p = product(it.pid), f = flavorOf(it);
      return `<div class="line">
        <img src="${imgSrc(f.image)}" alt="">
        <div><b>${esc(shortName(p))}</b><small>${esc(f.nameCn)} · ${esc(f.name)}</small>${stock.out(p.id, f.name) ? '<em class="so-line">刚卖完了，请删掉这一行</em>' : ''}<button type="button" class="rm" data-rm="${i}">删除</button></div>
        <div class="r"><span class="num">${euro(p.price * it.qty)}</span>
          <div class="mini"><button type="button" data-q="${i}" data-d="-1" aria-label="减少">−</button><output class="num">${it.qty}</output><button type="button" data-q="${i}" data-d="1" aria-label="增加">+</button></div></div>
      </div>`;
    }).join('') + giftLines(t);
    foot.innerHTML = `
      <div class="sum">
        <div><span>小计 · ${count()} 件</span><span class="num">${euro(t.sub)}</span></div>
        ${t.gifts.map(({ p }) => `<div class="save"><span>集章赠品 · ${esc(shortName(p))} 1 ${stampUnit(p)}</span><span>免费</span></div>`).join('')}
      </div>
      <div class="row"><b>合计</b><span class="total num">${euro(t.sub)}</span></div>
      <button type="button" class="btn btn-primary" data-act="next">去填写取货信息 →</button>`;
  }

  // ---------- step 2: details ----------
  const field = (id, label, attrs = '') => `<div class="field" data-f="${id}"><label for="f-${id}">${label}</label><input id="f-${id}" value="${esc(form[id])}" ${attrs}><span class="err"></span></div>`;
  function renderDetails() {
    const t = totals(), n = count(), u = account.user();
    if (u && !form.name && !form.phone) { form.name = u.name; form.phone = u.phone ? account.showPhone(u.phone) : ''; }
    const modeBtn = k => {
      const locked = k === 'delivery' && n < 5;
      return `<button type="button" class="mode${locked ? ' locked' : ''}" data-mode="${k}" aria-pressed="${form.mode === k}"><b>${MODES[k].name}</b><small>${locked ? `还差 ${5 - n} 件` : MODES[k].note}</small></button>`;
    };
    let extra = '';
    if (form.mode === 'pickup') extra = `<div class="info"><b>Metro El Capricho</b><span>周一至周四 全天 · 周末 11:00–18:00</span><span>下单后我们会用 WhatsApp 跟你约具体时间</span></div>`;
    if (form.mode === 'delivery') extra = `<div class="field"><label>送达时间（今天）</label><div class="chipset">${SLOTS.map(s => `<button type="button" data-slot="${s}" aria-pressed="${form.slot === s}" class="num">${s}</button>`).join('')}</div></div>
      ${field('street', '送货地址', 'autocomplete="street-address" placeholder="街道 + 门牌号，马德里"')}
      <div class="info"><span>可现金付款，送到时付清</span></div>`;
    if (form.mode === 'postal') extra = `
      ${field('recipient', '收件人', 'autocomplete="name" placeholder="全名"')}
      ${field('street', '街道 + 门牌号', 'autocomplete="address-line1"')}
      ${field('floor', '楼层 / 公寓（选填）', 'autocomplete="address-line2"')}
      <div class="two">${field('cp', '邮编', 'inputmode="numeric" autocomplete="postal-code"')}${field('city', '城市', 'autocomplete="address-level2"')}</div>
      ${field('province', '省份 / 自治区', 'autocomplete="address-level1"')}
      <div class="field"><label for="f-country">国家</label><select id="f-country">${[['ES', '西班牙 España'], ['EU', '其他欧盟国家（运费 WhatsApp 确认）']].map(([v, l]) => `<option value="${v}"${form.country === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`;
    body.innerHTML = `
      <fieldset class="fs"><legend>联系人</legend>
        ${field('name', '姓名', 'autocomplete="name" placeholder="怎么称呼你"')}
        ${field('phone', '手机号（WhatsApp）', 'type="tel" inputmode="tel" autocomplete="tel" placeholder="+34 6XX XXX XXX"')}
      </fieldset>
      <fieldset class="fs"><legend>取货方式</legend>
        <div class="modes">${Object.keys(MODES).map(modeBtn).join('')}</div>
        ${extra}
      </fieldset>
      <fieldset class="fs"><legend>优惠码</legend>
        <div class="coupon"><div class="field" style="flex:1"><input id="f-coupon" value="${esc(form.coupon)}" placeholder="没有可不填" aria-label="优惠码"></div><button type="button" data-act="coupon">使用</button></div>
      </fieldset>
      <p class="acct-err" id="cpErr" role="alert"></p>
      <p class="fine">下单即表示你确认已满 18 岁，并已阅读<a href="#">隐私政策</a>。Al enviar el pedido confirma que es mayor de 18 años.</p>`;
    foot.innerHTML = `
      <div class="sum">
        <div><span>小计 · ${n} 件</span><span class="num">${euro(t.sub)}</span></div>
        ${t.gifts.map(({ p, f }) => `<div class="save"><span>集章赠品 · ${esc(shortName(p))} · ${esc(f.nameCn)}</span><span>免费</span></div>`).join('')}
        ${form.mode === 'postal' ? `<div><span>运费</span><span class="num">${t.ship ? euro(t.ship) : '包邮'}</span></div>` : ''}
      </div>
      <div class="row"><b>应付</b><span class="total num">${euro(t.total)}</span></div>
      <button type="button" class="btn btn-primary" data-act="submit">提交订单</button>`;
  }
  function validate() {
    const gone = items.find(it => stock.out(it.pid, it.flavor));
    if (gone) { $('cpErr').textContent = `${shortName(product(gone.pid))} · ${flavorOf(gone).nameCn} 刚卖完了，请回购物车删掉再提交`; return false; }
    const need = ['name', 'phone'];
    if (form.mode === 'delivery') need.push('street');
    if (form.mode === 'postal') need.push('recipient', 'street', 'cp', 'city', 'province');
    const msgs = { name: '请填写姓名', phone: '请填写手机号', street: '请填写地址', recipient: '请填写收件人', cp: '请填写邮编', city: '请填写城市', province: '请填写省份' };
    let first = null;
    body.querySelectorAll('.field[data-f]').forEach(el => { el.classList.remove('bad'); el.querySelector('.err').textContent = ''; });
    for (const k of need) {
      let bad = !form[k].trim();
      if (k === 'phone' && !bad && form.phone.replace(/\D/g, '').length < 9) { bad = true; msgs.phone = '手机号看起来不完整'; }
      if (k === 'cp' && !bad && form.country === 'ES' && !/^\d{5}$/.test(form.cp.trim())) { bad = true; msgs.cp = '西班牙邮编是 5 位数字'; }
      if (!bad) continue;
      const el = body.querySelector(`.field[data-f="${k}"]`);
      if (el) { el.classList.add('bad'); el.querySelector('.err').textContent = msgs[k]; first = first || el.querySelector('input'); }
    }
    if (form.mode === 'delivery' && count() < 5) { first = first || body.querySelector('[data-mode="delivery"]'); }
    first?.focus();
    return !first;
  }

  // ---------- step 3: done ----------
  function renderDone() {
    const o = order, u = account.user();
    const lines = o.items.map(it => `${shortName(product(it.pid))} · ${flavorOf(it).nameCn} × ${it.qty}`);
    const where = o.form.mode === 'pickup' ? 'Metro El Capricho 自取'
      : o.form.mode === 'delivery' ? `外送 ${o.form.slot} · ${o.form.street}`
      : `邮寄 · ${o.form.recipient}, ${o.form.street} ${o.form.floor}, ${o.form.cp} ${o.form.city}`;
    const free = o.t.gifts.map(({ p, f }) => `\n集章卡满 10 送 1：${shortName(p)} · ${f.nameCn} × 1（免费）`).join('');
    const msg = `你好，我下了订单 ${o.no}\n${lines.join('\n')}${free}\n${where}\n应付 ${euro(o.t.total)}\n${o.form.name} ${o.form.phone}`;
    const stamps = !o.sent ? ''
      : o.member ? `<div class="stampbar"><span class="sb-h">店家确认后盖章</span>
        ${Object.keys(o.t.earn).map(pid => {
          const p = product(+pid), after = stampStore.get(p.id) + o.t.earn[pid];
          return `<div class="sb-row"><b>${esc(shortName(p))}</b><small>+${o.t.earn[pid]} 个 · 盖完是 ${Math.min(after, STAMPS_PER_REWARD)} / ${STAMPS_PER_REWARD}${after >= STAMPS_PER_REWARD ? `，下一单送 1 ${stampUnit(p)}` : ''}</small></div>`;
        }).join('')}
        <small>确认一般在几小时内，页面开着时会自己盖上。</small>
        <button type="button" class="link" data-act="stamps">去看集章卡 →</button></div>`
      : `<div class="stampbar guest"><span class="sb-h">这单本来能盖 ${Object.values(o.t.earn).reduce((a, b) => a + b, 0)} 个章</span><small>注册会员，下一单开始集章：同一款满 10 个送 1 支。</small>
        <div class="sb-act"><button type="button" class="btn btn-primary" data-act="join">注册领卡</button></div></div>`;
    body.innerHTML = `
      <div class="okmark${o.sent ? '' : ' warn'}" aria-hidden="true">${o.sent ? '✓' : '!'}</div>
      <div class="done-h">${o.sent
        ? `<h3>订单已提交</h3><p>订单号 <b class="num">${o.no}</b> · 店家确认后会在 WhatsApp 联系你</p>`
        : `<h3>还差一步</h3><p>暂时连不上服务器，<b>请点下面的按钮用 WhatsApp 把订单发给店家</b>，发出去才算下单。</p>`}</div>
      <div class="receipt">
        ${o.items.map(it => `<div class="r"><span>${esc(shortName(product(it.pid)))} · ${esc(flavorOf(it).nameCn)} × ${it.qty}</span><span class="num">${euro(product(it.pid).price * it.qty)}</span></div>`).join('')}
        ${o.t.gifts.map(({ p, f }) => `<div class="r"><span>赠品 · ${esc(shortName(p))} · ${esc(f.nameCn)} × 1</span><b>免费</b></div>`).join('')}
        ${o.t.ship ? `<div class="r muted"><span>运费</span><span class="num">${euro(o.t.ship)}</span></div>` : ''}
        <div class="r"><b>应付</b><b class="num">${euro(o.t.total)}</b></div>
        <div class="r muted"><span>${esc(where)}</span></div>
      </div>
      ${stamps}`;
    foot.innerHTML = o.sent
      ? `<button type="button" class="btn btn-primary" data-act="close">完成</button>
        <a class="btn btn-ghost wa-q" href="https://wa.me/${WA}?text=${encodeURIComponent(`你好，我刚下了订单 ${o.no}，想问一下`)}" target="_blank" rel="noopener">有问题？WhatsApp 问店家</a>`
      : `<a class="btn btn-wa" href="https://wa.me/${WA}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">在 WhatsApp 发送订单给店家</a>
        <button type="button" class="btn btn-ghost" data-act="close">完成</button>`;
  }

  async function submit(btn) {
    if (sending || !validate()) return;
    const t = totals(), u = account.user(), err = $('cpErr');
    sending = true; btn.disabled = true; btn.textContent = '提交中…'; err.textContent = '';
    let res = null, offline = false;
    try {
      res = await account.api('order', { method: 'POST', body: {
        items: items.map(({ pid, flavor, qty }) => ({ pid, flavor, qty })),
        form,
        gifts: Object.fromEntries(t.gifts.map(g => [g.p.id, g.f.name])),
      } });
    } catch (e) {
      offline = e.offline;
      // a gift has to be checked against the server's stamp count, so it can't go out by WhatsApp alone
      if (!offline || t.gifts.length) {
        sending = false; btn.disabled = false; btn.textContent = '提交订单';
        err.textContent = offline ? '暂时连不上服务器，赠品要在线核对，请稍后再试' : e.message;
        if (!offline && e.status === 400) account.refresh();
        return;
      }
    }
    sending = false;
    order = { no: res?.no || `VS${Date.now().toString().slice(-6)}`, sent: !!res, member: !!(res?.member && u), items: items.map(it => ({ ...it })), form: { ...form }, t };
    Object.keys(giftPick).forEach(k => delete giftPick[k]);
    items = []; save();
    go(2);
    // gift stamps were taken off on the server; the card catches up
    if (order.member) account.refresh();
  }

  function render() {
    panel.querySelectorAll('.steps span').forEach(s => {
      const k = +s.dataset.s;
      s.className = k === step ? 'on' : k < step ? 'done' : '';
      if (k === step) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
    });
    $('cpBack').hidden = step !== 1;
    [renderCart, renderDetails, renderDone][step]();
  }
  function go(s) { step = s; render(); body.scrollTop = 0; }

  function open() {
    lastFocus = document.activeElement;
    $('toast').classList.remove('show');
    if (step === 2) step = 0;
    render();
    panel.classList.add('open'); scrim.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    $('cpClose').focus({ preventScroll: true });
  }
  function close() {
    if (!panel.classList.contains('open')) return;
    panel.classList.remove('open'); scrim.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    lastFocus?.focus?.({ preventScroll: true });
  }

  // ---------- events ----------
  panel.addEventListener('change', e => {
    if (e.target.dataset.gift) { giftPick[e.target.dataset.gift] = e.target.value; render(); }
  });
  panel.addEventListener('input', e => {
    const id = e.target.id?.replace(/^f-/, '');
    if (id in form) form[id] = e.target.value;
    if (id === 'country') render();
    const f = e.target.closest('.field.bad');
    if (f) { f.classList.remove('bad'); f.querySelector('.err').textContent = ''; }
  });
  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.rm) { items.splice(+b.dataset.rm, 1); save(); render(); }
    else if (b.dataset.q) {
      const it = items[+b.dataset.q];
      it.qty = Math.max(1, Math.min(20, it.qty + +b.dataset.d));
      save(); render();
    } else if (b.dataset.mode) { form.mode = b.dataset.mode; render(); }
    else if (b.dataset.slot) { form.slot = b.dataset.slot; render(); }
    else if (b.dataset.act === 'next') go(1);
    else if (b.dataset.act === 'close') close();
    else if (b.dataset.act === 'stamps') { close(); onStamps?.(order && +Object.keys(order.t.earn)[0]); }
    else if (b.dataset.act === 'join' || b.dataset.act === 'signin') account.open(b.dataset.act === 'join' ? 'register' : 'login', step === 2 ? '' : '登录后回到购物车，这单就能集章');
    else if (b.dataset.act === 'coupon') {
      const btn = b; btn.textContent = form.coupon.trim() ? '已记下' : '使用';
      if (form.coupon.trim()) setTimeout(() => { btn.textContent = '使用'; }, 1600);
    } else if (b.dataset.act === 'submit') submit(b);
  });
  $('cpBack').addEventListener('click', () => go(0));
  $('cpClose').addEventListener('click', close);
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  stock.on(() => { if (panel.classList.contains('open')) render(); });
  // signing in or out while the cart is open: redraw its stamp bar / gifts / prefilled contact
  account.on(u => {
    if (!u) { form.name = form.phone = ''; Object.keys(giftPick).forEach(k => delete giftPick[k]); }
    if (panel.classList.contains('open') && step !== 2) render();
  });
  stampStore.on(() => { if (panel.classList.contains('open') && step === 0) render(); });

  onCount(count());
  return { add, open, close, count };
}
