// Poster for the stamp card, the shop's standing offer, shown on every visit: nine stamps thump in on their own,
// the visitor presses the tenth, and the free 11th unit drops into the reward circle.
// For guests the poster is a sign-up: the card has a blank cardholder line, the form opens in place,
// the name they type is written onto the card, and a successful sign-up stamps it "已开卡".
function createPromo({ products, account, onShop, onStamps, onDone }) {
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dash = products.find(p => p.id === 1) || products[0];
  const gift = dash.flavors[Math.floor(Math.random() * dash.flavors.length)];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const me = account.user();

  const wrap = document.createElement('div');
  wrap.className = 'promo';
  wrap.innerHTML = `
    <div class="promo-poster" role="dialog" aria-modal="true" aria-labelledby="promoTitle" tabindex="-1">
      <i class="promo-tape" aria-hidden="true"></i>
      <button type="button" class="promo-x" aria-label="关闭">×</button>
      <span class="promo-eyebrow">口粮专卖店 · 集章卡</span>
      <span class="promo-always">常驻活动 · 不限时</span>
      <h2 id="promoTitle"><span>买</span><b>10</b><span>送</span><b class="one">1</b></h2>
      <p class="promo-sub">同一款满 10 支，<em>第 11 支免费</em></p>
      <div class="promo-card" aria-hidden="true">
        <div class="promo-slots">${Array.from({ length: 10 }, (_, i) => `<span class="ps" style="--r:${(Math.random() * 40 - 20).toFixed(0)}deg"><small>${i + 1}</small><i class="ink"><b>口粮</b><em>MADRID</em></i></span>`).join('')}</div>
        <div class="promo-gift"><span class="pg-q">11</span><img src="${imgSrc(gift.image)}" alt=""><span class="pg-tag">送你的</span></div>
        <div class="pc-holder"><small>持卡人<br>TITULAR</small><span class="pc-name" data-ph="写上你的名字">${me ? esc(me.name) : ''}</span></div>
        <i class="pc-seal">已开卡<em>ACTIVADA</em></i>
      </div>
      <div class="promo-act">
        <p class="promo-hint" role="status">最后一个章，你来盖</p>
        <button type="button" class="promo-press">盖！</button>
      </div>
      ${me ? `<div class="promo-cta">
        <button type="button" class="btn promo-go">去挑下一支 →</button>
        <button type="button" class="promo-more">${esc(me.name)}，看看我的集章卡</button>
      </div>` : `<div class="promo-cta">
        <button type="button" class="btn promo-join-go">注册会员 · 免费领卡 →</button>
        <p class="promo-why">领卡 = 注册会员账号（手机号或邮箱 + 密码）</p>
        <button type="button" class="promo-skip">先逛逛</button>
      </div>
      <form class="promo-join" novalidate hidden>
        <p class="pj-h">注册会员账号，卡就绑在账号上</p>
        <div class="pj-f"><label for="p-account">手机号或邮箱</label><input id="p-account" name="account" type="text" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="612 345 678 / tu@email.com"></div>
        <div class="pj-f"><label for="p-name">怎么称呼你</label><input id="p-name" name="name" autocomplete="nickname" maxlength="40" placeholder="会写在卡上"></div>
        <div class="pj-f"><label for="p-password">密码</label><div class="a-in"><input id="p-password" name="password" type="password" autocomplete="new-password" minlength="6" placeholder="至少 6 位"><button type="button" class="a-eye" data-eye>显示</button></div></div>
        <label class="acct-check"><input type="checkbox" name="adult"><span>我已年满 18 岁 · Soy mayor de 18 años</span></label>
        <p class="acct-err" role="alert"></p>
        <button type="submit" class="btn promo-join-go">注册账号并领卡</button>
        <div class="pj-alt"><button type="button" data-login>已经有账户？登录</button><button type="button" data-back>返回</button></div>
      </form>
      <div class="promo-done" hidden>
        <p class="pd-h" role="status"></p>
        <p class="pd-s"></p>
        <button type="button" class="btn promo-go">去挑第一支 →</button>
        <button type="button" class="promo-more" data-stamps>看看我的集章卡</button>
      </div>`}
    </div>`;
  document.body.appendChild(wrap);
  const q = s => wrap.querySelector(s);
  const poster = q('.promo-poster'), slots = [...wrap.querySelectorAll('.ps')], press = q('.promo-press'), hint = q('.promo-hint');
  let lastFocus = null, timers = [];

  const thud = () => {
    if (REDUCED) return;
    poster.classList.remove('thud'); void poster.offsetWidth; poster.classList.add('thud');
  };
  const stamp = i => { slots[i].classList.add('on'); thud(); };
  function reveal() {
    stamp(9);
    press.disabled = true;
    hint.textContent = `集满了！送你 1 支鸭嘴兽 · ${gift.nameCn}`;
    timers.push(setTimeout(() => {
      wrap.classList.add('won');
      if (REDUCED) return;
      // a burst of the shop's asterisks out of the reward circle
      const g = q('.promo-gift');
      for (let k = 0; k < 14; k++) {
        const s = document.createElement('i');
        s.className = 'spark'; s.textContent = '✱';
        const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 70;
        s.style.cssText = `--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d}px;--s:${0.6 + Math.random() * 0.8};--c:${k % 3 ? '#9a4329' : '#8fa03a'}`;
        g.appendChild(s);
        setTimeout(() => s.remove(), 900);
      }
    }, REDUCED ? 0 : 260));
  }

  function open() {
    lastFocus = document.activeElement;
    lockScroll('promo', true);
    wrap.classList.add('open');
    poster.focus({ preventScroll: true });
    if (REDUCED) { slots.slice(0, 9).forEach(s => s.classList.add('on')); wrap.classList.add('ready'); return; }
    // nine stamps in a quickening rhythm, then hand the stamper to the visitor
    let t = 650;
    for (let i = 0; i < 9; i++) { timers.push(setTimeout(() => stamp(i), t)); t += Math.max(120, 260 - i * 18); }
    timers.push(setTimeout(() => { wrap.classList.add('ready'); press.focus({ preventScroll: true }); }, t + 150));
  }
  let closed = false;
  // next: another poster follows (onDone); 'now' runs `then` right away instead of after that poster
  function close(then, next = true) {
    if (closed) return; closed = true;
    timers.forEach(clearTimeout);
    wrap.classList.remove('open');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => wrap.remove(), REDUCED ? 0 : 400);
    // another poster follows: the page stays where it is, and this poster's action (a scroll) runs once that one closes
    if (next === 'now') { then?.(); then = null; }
    if (next && onDone) { setTimeout(() => { lockScroll('promo', false); onDone(then); }, REDUCED ? 0 : 450); return; }
    lockScroll('promo', false);
    if (then) then(); else lastFocus?.focus?.({ preventScroll: true });
  }
  const onKey = e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    // keep Tab inside the poster
    if (e.key === 'Tab') {
      const f = [...poster.querySelectorAll('button:not([disabled]), input')].filter(el => el.offsetParent);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === poster)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  press.addEventListener('click', reveal);
  q('.promo-card').addEventListener('click', () => { if (wrap.classList.contains('ready') && !press.disabled) reveal(); });
  q('.promo-x').addEventListener('click', () => close());
  wrap.querySelectorAll('.promo-go, .promo-skip').forEach(b => b.addEventListener('click', () => close(onShop)));
  if (me) q('.promo-more').addEventListener('click', () => close(onStamps));
  else join();
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });


  // guests: the sign-up opens inside the poster; the nickname is written onto the card as it's typed
  function join() {
    const form = q('.promo-join'), err = form.querySelector('.acct-err'), name = q('.pc-name'), done = q('.promo-done');
    const openForm = () => {
      if (!wrap.classList.contains('won')) { timers.forEach(clearTimeout); slots.forEach(s => s.classList.add('on')); wrap.classList.add('ready', 'won'); press.disabled = true; }
      wrap.classList.add('joining');
      form.hidden = false;
      poster.scrollTop = 0;
      form.elements.account.focus({ preventScroll: true });
    };
    q('.promo-cta .promo-join-go').addEventListener('click', openForm);
    form.querySelector('[data-back]').addEventListener('click', () => { wrap.classList.remove('joining'); form.hidden = true; q('.promo-cta .promo-join-go').focus(); });
    form.querySelector('[data-login]').addEventListener('click', () => close(() => account.open('login'), 'now'));
    form.querySelector('[data-eye]').addEventListener('click', e => {
      const inp = form.elements.password, show = inp.type === 'password';
      inp.type = show ? 'text' : 'password'; e.target.textContent = show ? '隐藏' : '显示';
    });
    form.addEventListener('input', e => {
      err.textContent = '';
      if (e.target.name === 'name') name.textContent = e.target.value.trim().slice(0, 40);
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = { account: form.elements.account.value, name: form.elements.name.value, password: form.elements.password.value, adult: form.elements.adult.checked };
      const bad = account.check('register', v);
      if (bad) { err.textContent = bad[0]; form.elements[bad[1]]?.focus(); return; }
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true; btn.textContent = '注册中…'; err.textContent = '';
      try {
        const u = await account.signIn('register', v);
        // the demo stamps come off; the real card starts empty, and gets its activation seal
        slots.forEach(s => s.classList.remove('on'));
        wrap.classList.remove('won', 'joining');
        wrap.classList.add('owned');
        name.textContent = u.name;
        form.hidden = true; done.hidden = false;
        q('.pd-h').textContent = `${u.name}，注册成功，卡开好了！`;
        q('.pd-s').textContent = `以后用 ${v.account.trim()} + 密码登录看章，下一单开始集。`;
        thud();
        done.querySelector('.promo-go').focus({ preventScroll: true });
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false; btn.textContent = '注册账号并领卡';
      }
    });
    done.querySelector('[data-stamps]').addEventListener('click', () => close(onStamps));
  }

  setTimeout(open, 700);
}
