// Page wiring: hero flavor chips, product wall, flavor drawer, cart count.
(() => {
  const $ = id => document.getElementById(id);
  const products = PRODUCTS;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dash = products.find(p => p.id === 1);

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toastEl = $('toast');
  let toastTimer;
  const toast = (msg, action) => {
    toastEl.textContent = msg; toastEl.classList.add('show');
    if (action) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = action.label;
      b.addEventListener('click', action.run);
      toastEl.appendChild(b);
    }
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), action ? 4000 : 2400);
  };
  const goStamps = () => $('stamps').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
  const account = createAccount({ products, onStamps: goStamps });
  const checkout = createCheckout({
    products, account,
    onCount: n => { $('cartCnt').textContent = n; },
    onStamps: goStamps,
  });

  // the stamp-card (register) poster comes first; when it is closed, the IceMax clearance poster follows
  // members already have the card: they only see the clearance poster
  const showClearance = after => createClearance({
    products,
    onShop: () => { $('clearance').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' }); },
    onDone: after,
  });
  if (account.user()) setTimeout(showClearance, 100);
  else createPromo({
    products, account,
    onShop: () => $('products').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' }),
    onStamps: goStamps,
    onDone: showClearance,
  });

  // ---------- account button ----------
  const acctBtn = $('acctBtn');
  const paintAccount = u => {
    acctBtn.innerHTML = u ? `<i aria-hidden="true">${[...u.name][0]}</i><span>我的</span>` : '<span>登录 / 注册</span>';
    acctBtn.classList.toggle('in', !!u);
    acctBtn.setAttribute('aria-label', u ? `我的账户：${u.name}` : '登录或注册会员');
    $('stamps').classList.toggle('guest', !u);
    $('stampsJoin').hidden = !!u;
    $('stampsMember').hidden = !u;
    $('stampsHello').textContent = u ? `${u.name} 的集章卡` : '';
  };
  account.on(paintAccount);
  paintAccount(account.user());
  acctBtn.addEventListener('click', () => account.open());
  $('stampsJoin').addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if (b) account.open(b.dataset.a);
  });

  // ---------- stamp card ----------
  let card = null;
  whenNear($('stamps'), () => {
    try { card = window.THREE && createStampCard($('stampCard'), { onFlip: up => { $('stampFlip').textContent = up ? '翻过来看规则 ↻' : '翻回正面 ↻'; } }); } catch (e) { console.error(e); }
    if (!card) $('stampCard').closest('.stamps-stage').hidden = true;
    else showLine(cardLine, true);
  });
  // one tab per product line; the card shows the selected line, and jumps to whichever line just got stamps
  const tabs = $('stampTabs');
  let cardLine = products.find(p => stampStore.get(p.id) > 0) || dash;
  const paintTabs = () => {
    tabs.innerHTML = products.map(p => {
      const n = stampStore.get(p.id), full = n >= STAMPS_PER_REWARD;
      return `<button type="button" data-id="${p.id}" class="${full ? 'full' : ''}" aria-pressed="${p === cardLine}">${shortName(p)}<small class="num">${full ? '满' : `${n}/${STAMPS_PER_REWARD}`}</small></button>`;
    }).join('');
  };
  const showLine = async (p, instant) => {
    cardLine = p;
    const n = stampStore.get(p.id), full = n >= STAMPS_PER_REWARD, unit = stampUnit(p);
    $('stampNum').textContent = Math.min(n, STAMPS_PER_REWARD);
    $('stampOf').textContent = `/ 10 个章 · ${shortName(p)}`;
    $('stampLeft').textContent = full ? `集满了！下一单送你 1 ${unit}${shortName(p)}，口味你挑` : `这款再买 ${STAMPS_PER_REWARD - n} ${unit}，送 1 ${unit}`;
    paintTabs();
    if (instant !== undefined) card?.show(p, n, await flavorColor(p.image));
  };
  showLine(cardLine, true);
  tabs.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b && +b.dataset.id !== cardLine.id) showLine(products.find(p => p.id === +b.dataset.id), true);
  });
  stampStore.on((changes, prev, quiet) => {
    if (quiet) {
      // signed in / out: repaint the current card in place
      if (!account.user() || !(stampStore.get(cardLine.id) > 0)) cardLine = products.find(p => stampStore.get(p.id) > 0) || dash;
      showLine(cardLine, true);
      return;
    }
    // show the first line that gained stamps, starting from its old count so the stamper presses the new ones
    const pid = Object.keys(changes).find(k => changes[k] > prev[k]) || Object.keys(changes)[0];
    const p = products.find(x => x.id === +pid);
    if (p !== cardLine) {
      cardLine = p;
      flavorColor(p.image).then(c => { card?.show(p, Math.min(prev[pid], STAMPS_PER_REWARD), c); card?.set(changes[pid]); });
      showLine(p);
    } else {
      showLine(p);
      card?.set(changes[pid]);
    }
    $('stamps').classList.remove('pulse'); void $('stamps').offsetWidth; $('stamps').classList.add('pulse');
  });
  $('stampFlip').addEventListener('click', () => card?.flip());

  // ---------- header 集章卡 button: every card's progress at a glance ----------
  const cardBtn = $('cardBtn'), cardPop = $('cardPop');
  function paintCardPop() {
    const u = account.user();
    const full = products.filter(p => stampStore.get(p.id) >= STAMPS_PER_REWARD).length;
    const total = products.reduce((n, p) => n + Math.min(stampStore.get(p.id), STAMPS_PER_REWARD), 0);
    $('cardBadge').hidden = !u || !(full || total);
    $('cardBadge').textContent = full ? `${full} 满` : total;
    $('cardPopTitle').textContent = u ? `${u.name} 的集章卡` : '集章卡';
    $('cardPopGuest').hidden = !!u;
    $('cardPopLines').innerHTML = products.map(p => {
      const n = u ? stampStore.get(p.id) : 0, isFull = n >= STAMPS_PER_REWARD;
      return `<div class="am-line${isFull ? ' full' : ''}"><b>${esc(shortName(p))}</b><span class="dots" aria-hidden="true">${Array.from({ length: STAMPS_PER_REWARD }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span><small class="num">${isFull ? '满了，下单送 1' + stampUnit(p) : `${n}/${STAMPS_PER_REWARD}`}</small></div>`;
    }).join('');
    $('cardPopAct').innerHTML = u
      ? '<button type="button" class="btn btn-primary" data-pop="stamps">看 3D 集章卡</button><button type="button" class="btn btn-ghost" data-pop="me">我的账户</button>'
      : '<button type="button" class="btn btn-primary" data-pop="register">注册会员领卡</button><button type="button" class="btn btn-ghost" data-pop="login">登录</button>';
  }
  const setPop = open => {
    cardPop.hidden = !open; cardBtn.setAttribute('aria-expanded', String(open));
    if (open) paintCardPop();
  };
  cardBtn.addEventListener('click', e => { e.stopPropagation(); setPop(cardPop.hidden); });
  cardPop.addEventListener('click', e => {
    e.stopPropagation();
    const b = e.target.closest('[data-pop]');
    if (!b) return;
    setPop(false);
    if (b.dataset.pop === 'stamps') goStamps();
    else if (b.dataset.pop === 'me') account.open('me');
    else account.open(b.dataset.pop);
  });
  document.addEventListener('click', () => { if (!cardPop.hidden) setPop(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !cardPop.hidden) { setPop(false); cardBtn.focus(); } });
  account.on(paintCardPop);
  stampStore.on(() => paintCardPop());
  paintCardPop();
  const addToCart = (p, flavor, qty) => {
    checkout.add(p, flavor, qty);
    $('cartBtn').classList.add('bump'); setTimeout(() => $('cartBtn').classList.remove('bump'), 300);
    // inside the drawer the button and note confirm it; a toast there would sit on the buttons
    if (!$('drawer').classList.contains('open')) toast(`已加入：${shortName(p)} · ${flavor.nameCn} × ${qty}`, { label: '去结算', run: () => checkout.open() });
  };

  // ---------- hero ----------
  let device = null;
  try { device = window.THREE && createDevice($('device')); } catch (e) { console.error(e); }
  if (!device) $('device').closest('.stage-wrap').innerHTML = `<img src="${imgSrc(dash.flavors[0].image)}" alt="鸭嘴兽 Dash" style="width:100%;height:100%;object-fit:contain">`;

  let heroFlavor = dash.flavors[0];
  const HERO_CHIPS = 9;
  const chips = $('heroChips');
  // the hero shows 9 chips: the first 9 flavors in stock (sold-out ones only if fewer than 9 are left)
  let heroList = [];
  const paintHeroChips = () => {
    heroList = [...dash.flavors.filter(f => !stock.out(dash.id, f.name)), ...dash.flavors.filter(f => stock.out(dash.id, f.name))].slice(0, HERO_CHIPS);
    chips.querySelectorAll('.chip:not(.more)').forEach(c => c.remove());
    heroList.forEach(f => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip';
      b.setAttribute('aria-pressed', String(f === heroFlavor));
      b.setAttribute('aria-label', f.nameCn);
      b.title = f.nameCn; b.dataset.name = f.name;
      b.innerHTML = `<img src="${imgSrc(f.image)}" alt="" loading="lazy">`;
      b.addEventListener('click', () => setHeroFlavor(f, b));
      chips.insertBefore(b, more);
    });
  };
  const more = document.createElement('button');
  more.type = 'button'; more.className = 'chip more';
  more.textContent = `+${dash.flavors.length - HERO_CHIPS}`;
  more.setAttribute('aria-label', '查看全部口味');
  more.addEventListener('click', () => openDrawer(dash.id));
  chips.appendChild(more);
  paintHeroChips();

  async function setHeroFlavor(f, btn) {
    heroFlavor = f;
    chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.name === f.name)));
    $('heroFlavor').textContent = f.nameCn;
    $('heroFlavorEs').textContent = f.name;
    const hex = await flavorColor(f.image);
    document.documentElement.style.setProperty('--flavor', hex);
    device?.setFlavor(hex, f.name);
    paintHeroStock();
  }
  function paintHeroStock() {
    chips.querySelectorAll('.chip:not(.more)').forEach(c => c.classList.toggle('out', stock.out(dash.id, c.dataset.name)));
    const out = stock.out(dash.id, heroFlavor.name);
    $('heroAdd').disabled = out;
    $('heroAdd').textContent = out ? `${heroFlavor.nameCn} 缺货 · 换个口味` : `加入购物车 · ${euro(dash.price)}`;
  }
  setHeroFlavor(heroFlavor, chips.firstElementChild);
  let heroAuto = !REDUCED, heroIdx = 0;
  chips.addEventListener('click', () => { heroAuto = false; });
  $('device').addEventListener('pointerdown', () => { heroAuto = false; });
  $('heroAdd').addEventListener('click', () => { if (!stock.out(dash.id, heroFlavor.name)) addToCart(dash, heroFlavor, 1); });

  // ---------- IceMax clearance block ----------
  const icemax = products.find(p => p.id === 2);
  let iceDev = null;
  whenNear($('clearance'), () => {
    try { iceDev = window.THREE && createDevice($('iceDevice'), { build: buildIcemax }); } catch (e) { console.error(e); }
    if (!iceDev) $('iceDevice').closest('.stage-wrap').innerHTML = `<img src="${imgSrc(icemax.image)}" alt="IceMax" style="width:100%;height:100%;object-fit:contain">`;
    else setIceFlavor(iceFlavor);
  });
  $('icePrice').textContent = euro(icemax.price); $('iceWas').textContent = icemax.was ? euro(icemax.was) : '';
  $('clLeakT').textContent = LEAK_TITLE; $('clLeakB').textContent = LEAK_BODY;
  let iceFlavor = icemax.flavors[0], iceTouched = false;
  const iceChips = $('iceChips');
  icemax.flavors.forEach(f => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.name = f.name;
    b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', f.nameCn); b.title = f.nameCn;
    b.innerHTML = `<img src="${imgSrc(f.image)}" alt="" loading="lazy">`;
    b.addEventListener('click', () => setIceFlavor(f));
    iceChips.appendChild(b);
  });
  async function setIceFlavor(f) {
    iceFlavor = f;
    iceChips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.name === f.name)));
    $('iceFlavor').textContent = f.nameCn; $('iceFlavorEs').textContent = f.name;
    iceDev?.setFlavor(await flavorColor(f.image), f.name);
    paintIceStock();
  }
  function paintIceStock() {
    inStockFirst(iceChips, '.chip', icemax.id);
    const out = stock.out(icemax.id, iceFlavor.name);
    $('iceAdd').disabled = out;
    $('iceAdd').textContent = out ? `${iceFlavor.nameCn} 缺货 · 换个口味` : `加入购物车 · ${euro(icemax.price)}`;
  }
  stock.on(() => { paintIceStock(); const f = icemax.flavors.find(x => !stock.out(icemax.id, x.name)); if (f && stock.out(icemax.id, iceFlavor.name) && !iceTouched) setIceFlavor(f); });
  iceChips.addEventListener('click', () => { iceTouched = true; });
  $('iceAdd').addEventListener('click', () => { if (!stock.out(icemax.id, iceFlavor.name)) addToCart(icemax, iceFlavor, 1); });
  $('iceAll').addEventListener('click', () => openDrawer(icemax.id));
  setIceFlavor(iceFlavor);

  // ---------- product wall ----------
  let wall = null;
  whenNear($('rail'), () => {
    try { wall = window.THREE && createTags({ rail: $('rail'), canvas: $('tags'), products, onPick: openDrawer }); } catch (e) { console.error(e); }
    if (!wall) {
      $('railLoading').textContent = '当前浏览器不支持 3D 展示，请点上面的款式按钮选购。';
      $('rail').style.height = 'auto';
    }
  }, '500px');
  if (matchMedia('(hover: none)').matches) document.querySelector('#products p').textContent = '左右滑动，点海报选口味';
  $('panL').addEventListener('click', () => wall?.pan(-1));
  $('panR').addEventListener('click', () => wall?.pan(1));

  const index = $('index');
  products.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" data-id="${p.id}" aria-pressed="false">${shortName(p)}<small class="num">${p.flavors.length} 味</small></button>`;
    index.appendChild(li);
  });
  index.addEventListener('pointerover', e => {
    const b = e.target.closest('button');
    if (b && b !== index.last) { index.last = b; wall?.nudge(+b.dataset.id, 0.8); }
  });
  index.addEventListener('pointerleave', () => { index.last = null; });
  index.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    index.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    wall?.focus(+b.dataset.id); wall?.nudge(+b.dataset.id, 1); openDrawer(+b.dataset.id);
  });

  // ---------- drawer ----------
  const drawer = $('drawer'), scrim = $('scrim');
  let cur = null, curFlavor = null, qty = 1, lastFocus = null, openedAt = 0;

  function pickFlavor(f) {
    curFlavor = f;
    $('dFlavor').textContent = f.nameCn;
    $('dFlavorEs').textContent = f.name;
    $('dImg').src = imgSrc(f.image);
    $('dImg').alt = `${shortName(cur)} · ${f.nameCn}`;
    $('dTags').innerHTML = f.tags.map(t => `<span>${t}</span>`).join('');
    $('dFlavors').querySelectorAll('.flv').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.name === f.name)));
    wall?.showFlavor(cur.id, f.image);
    paintStock();
    if (cur.id === dash.id) {
      const chip = [...chips.querySelectorAll('.chip')].find(c => c.dataset.name === f.name);
      setHeroFlavor(f, chip || null);
    }
  }
  // sold-out flavors stay visible (greyed, marked 缺货) but can't go in the cart
  function paintStock() {
    if (!cur) return;
    inStockFirst($('dFlavors'), '.flv', cur.id);
    const out = curFlavor && stock.out(cur.id, curFlavor.name);
    $('dAdd').disabled = !!out;
    $('dAdd').textContent = out ? '这个口味缺货' : '加入购物车';
  }
  stock.on(() => {
    paintStock(); paintHeroChips(); paintHeroStock();
    // the hero opened on a flavor that turns out to be sold out: start on the first one in stock
    if (heroAuto && stock.out(dash.id, heroFlavor.name)) { heroIdx = 0; setHeroFlavor(heroList[0], chips.firstElementChild); }
  });
  function setQty(n) {
    qty = Math.max(1, Math.min(20, n));
    $('qVal').textContent = qty;
    $('dPrice').textContent = euro(cur.price * qty);
    $('dWas').hidden = !cur.was;
    if (cur.was) $('dWas').textContent = euro(cur.was * qty);
  }

  function openDrawer(id) {
    cur = products.find(p => p.id === id);
    $('dWa').href = `https://wa.me/34697332407?text=${encodeURIComponent(`你好，我想问一下 ${cur ? shortName(cur) : ''} 的口味和库存`)}`;
    if (!cur) return;
    lastFocus = document.activeElement;
    $('dCount').textContent = `${products.indexOf(cur) + 1} / ${products.length} · ${cur.flavors.length} 种口味`;
    $('dName').innerHTML = esc(cur.name) + (cur.clearance ? '<span class="tagnow">清仓</span>' : '');
    $('dLeak').hidden = !cur.clearance;
    if (cur.clearance) { $('dLeak').querySelector('.leak-t').textContent = LEAK_TITLE; $('dLeak').querySelector('.leak-b').textContent = LEAK_BODY; }
    $('dDesc').textContent = cur.desc.zh;
    $('dNote').textContent = '';
    const grid = $('dFlavors');
    grid.innerHTML = '';
    cur.flavors.forEach(f => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'flv'; b.dataset.name = f.name;
      b.innerHTML = `<img src="${imgSrc(f.image)}" alt="" loading="lazy"><span>${f.nameCn}</span><em class="so">缺货</em>`;
      b.addEventListener('click', () => pickFlavor(f));
      grid.appendChild(b);
    });
    paintStock();
    const start = [cur.id === dash.id ? heroFlavor : null, ...cur.flavors].find(f => f && !stock.out(cur.id, f.name)) || cur.flavors[0];
    pickFlavor(start);
    setQty(1);
    openedAt = performance.now();
    drawer.classList.add('open'); scrim.classList.add('open'); lockScroll('drawer', true);
    drawer.setAttribute('aria-hidden', 'false');
    $('dClose').focus({ preventScroll: true });
  }
  function closeDrawer() {
    if (!drawer.classList.contains('open')) return;
    drawer.classList.remove('open'); scrim.classList.remove('open'); lockScroll('drawer', false);
    drawer.setAttribute('aria-hidden', 'true');
    lastFocus?.focus?.({ preventScroll: true });
  }
  $('qMinus').addEventListener('click', () => setQty(qty - 1));
  $('qPlus').addEventListener('click', () => setQty(qty + 1));
  let addedTimer;
  $('dAdd').addEventListener('click', () => {
    if (stock.out(cur.id, curFlavor.name)) return;
    addToCart(cur, curFlavor, qty);
    $('dNote').innerHTML = `✓ 已加入 ${curFlavor.nameCn} × ${qty}，可以继续挑别的口味 · <button type="button" id="dGo" style="text-decoration:underline;font-weight:900">去结算 (${checkout.count()} 件) →</button>`;
    $('dGo').addEventListener('click', () => { closeDrawer(); checkout.open(); });
    $('dAdd').textContent = '已加入 ✓';
    clearTimeout(addedTimer); addedTimer = setTimeout(paintStock, 1400);
    setQty(1);
  });
  $('dClose').addEventListener('click', closeDrawer);
  // a tap on the wall opens the drawer on pointerup; ignore the click the browser fires right after onto the scrim
  scrim.addEventListener('click', () => { if (performance.now() - openedAt > 400) closeDrawer(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });
  // ---------- every 3 s: hero and wall posters step to their next flavor ----------
  const step = new Map(products.map(p => [p.id, 0]));
  if (!REDUCED) setInterval(() => {
    if (document.hidden) return;
    const open = drawer.classList.contains('open') ? cur?.id : null;
    if (heroAuto && open !== dash.id) {
      heroIdx = (heroIdx + 1) % heroList.length;
      setHeroFlavor(heroList[heroIdx], chips.children[heroIdx]);
    }
    for (const p of products) {
      if (p.id === open || (p.id === dash.id && !heroAuto)) continue;
      const i = (step.get(p.id) + 1) % p.flavors.length;
      step.set(p.id, i);
      const f = p.id === dash.id ? heroList[heroIdx] : p.flavors[i];
      if (wall?.visible()) wall.showFlavor(p.id, f.image);
    }
  }, 3000);

  $('cartBtn').addEventListener('click', () => checkout.open());
})();
