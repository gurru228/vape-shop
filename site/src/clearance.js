// Clearance poster, shown on every visit after the stamp-card poster: the last IceMax batch at its clearance price (products.json).
// Layout: the 3D IceMax stands in a lit "shop window", a hang-tag with the price swings off it,
// flavor swatches run underneath. The poster only sells the price; the leak notice lives where the
// choice is made (clearance block, flavor drawer, cart, checkout tick box).
function createClearance({ products, onShop, onDone }) {
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ice = products.find(p => p.id === 2);
  const pick = ice.flavors[Math.floor(Math.random() * ice.flavors.length)];
  const wrap = document.createElement('div');
  wrap.className = 'promo clr';
  wrap.innerHTML = `
    <div class="promo-poster clr-poster" role="dialog" aria-modal="true" aria-labelledby="clrTitle" tabindex="-1">
      <button type="button" class="promo-x" aria-label="关闭">×</button>
      <div class="clr-band"><span>最后一批</span><i>✱</i><span>卖完即止</span></div>
      <h2 id="clrTitle" class="clr-h"><b>IceMax</b><small>低价清仓</small></h2>
      <div class="clr-window">
        <canvas class="clr-dev" aria-label="IceMax 3D 模型"></canvas>
        <img class="clr-fallback" src="${imgSrc(ice.image)}" alt="" hidden>
        <div class="clr-tag" aria-label="原价 ${euro(ice.was)}，清仓价 ${euro(ice.price)}">
          <i class="clr-hole" aria-hidden="true"></i>
          <s class="num">${euro(ice.was)}</s>
          <b class="num">€${Math.floor(ice.price)}<small>${euro(ice.price).slice(-3)}</small></b>
          <span>一支</span>
        </div>
      </div>
      <p class="clr-sub"><b class="num">12000</b> 口 · <b class="num">${ice.flavors.length}</b> 种口味 · <em class="clr-fl">${pick.nameCn}</em></p>
      <div class="clr-dots" aria-hidden="true">${ice.flavors.map(f => `<img src="${imgSrc(f.image)}" alt="" title="${f.nameCn}">`).join('')}</div>
      <div class="promo-cta">
        <button type="button" class="btn clr-go">去挑口味 →</button>
        <button type="button" class="promo-skip">先看看别的</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const poster = wrap.querySelector('.clr-poster');
  let finished = false, dev = null, cycle = 0;

  // phones get the product photo, stepping through the flavours: building a 3D scene while the poster opens
  // froze phones for a second or two. Computers get the turning 3D model, started once the poster is open.
  const PHONE = matchMedia('(max-width: 860px), (pointer: coarse)').matches;
  function photos() {
    const img = wrap.querySelector('.clr-fallback');
    wrap.querySelector('.clr-dev').hidden = true;
    img.hidden = false;
    let i = ice.flavors.indexOf(pick);
    const show = (f, fade) => {
      wrap.querySelector('.clr-fl').textContent = f.nameCn;
      if (!fade) { img.src = imgSrc(f.image); return; }
      // fade out, swap once the next photo is loaded, fade back in
      img.classList.add('swap');
      const next = new Image(); next.src = imgSrc(f.image);
      next.onload = next.onerror = () => setTimeout(() => { img.src = next.src; img.classList.remove('swap'); }, 300);
    };
    show(pick);
    if (!REDUCED) cycle = setInterval(() => { i = (i + 1) % ice.flavors.length; show(ice.flavors[i], true); }, 2600);
  }
  // the model turns slowly and steps through the flavours, like the hero
  async function startModel() {
    if (PHONE) return photos();
    try { dev = window.THREE && createDevice(wrap.querySelector('.clr-dev'), { build: buildIcemax }); } catch (e) { dev = null; }
    if (!dev) return photos();
    let i = ice.flavors.indexOf(pick);
    const show = async f => { dev.setFlavor(await flavorColor(f.image), f.name); wrap.querySelector('.clr-fl').textContent = f.nameCn; };
    await show(pick);
    if (!REDUCED) cycle = setInterval(() => { i = (i + 1) % ice.flavors.length; show(ice.flavors[i]); }, 2600);
  }

  const done = then => {
    if (finished) return; finished = true;
    clearInterval(cycle);
    wrap.classList.remove('open');
    lockScroll('clearance', false);
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => { dev?.dispose?.(); wrap.remove(); }, REDUCED ? 0 : 400);
    // onDone(then): `then` is this poster's own button (go to the clearance block), if it was pressed
    onDone?.(then);
  };
  const onKey = e => {
    if (e.key === 'Escape') { e.stopPropagation(); done(); }
    if (e.key === 'Tab') {
      const f = [...poster.querySelectorAll('button')].filter(el => el.offsetParent);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === poster)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  wrap.querySelector('.promo-x').addEventListener('click', () => done());
  wrap.querySelector('.promo-skip').addEventListener('click', () => done());
  wrap.querySelector('.clr-go').addEventListener('click', () => done(onShop));
  wrap.addEventListener('click', e => { if (e.target === wrap) done(); });
  lockScroll('clearance', true);
  setTimeout(() => {
    wrap.classList.add('open');
    poster.focus({ preventScroll: true });
    // phones: photos right away. Computers: the 3D model after the opening animation, in an idle moment
    if (PHONE) startModel();
    else setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(startModel, { timeout: 800 }) : startModel()), 450);
  }, 600);
}
