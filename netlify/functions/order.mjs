// Place an order: re-priced on the server, stored in the orders table as pending (待确认), pushed to the
// shop's Telegram with confirm / cancel buttons. A gift's 10 stamps come off now and go back if the shop
// cancels; earned stamps land only when the shop confirms (Telegram ✅ or the admin page).
import {
  json, fail, body, currentUser, bearer, priceOrder, orderNo, byId, shortName, STAMPS_PER_REWARD, soldOut,
  addStamps, insertOrder, setOrderFields, tg, tgChat, orderText, pendingKeyboard,
} from '../lib/shop.mjs';

export default async req => {
  if (req.method !== 'POST') return fail('not found', 404);
  const b = await body(req);
  if (!b) return fail('请求格式不对');
  try {
    let priced;
    const out = await soldOut({ strict: true });
    const auth = await currentUser(req);
    const user = auth?.user;
    // a stale or revoked session must not quietly turn into a guest order (no stamps, gift dropped): sign in again
    if (!user && bearer(req)) return fail('登录已过期，请重新登录后再提交（这单才能集章）', 401);
    const giftKeys = Object.keys(b.gifts && typeof b.gifts === 'object' ? b.gifts : {});
    // one gift per product line, keyed by its exact id ("1", not "01" / "1.0"): one full card = one free unit
    if (giftKeys.some(k => !byId.has(+k) || String(+k) !== k)) return fail('赠品不对，请刷新页面再试');
    // a signed-in member may send gifts only (a full card's free unit); everyone else needs something in the cart
    const giftsOnly = !!user && giftKeys.length > 0;
    try { priced = priceOrder(b.items, b.form, out, { giftsOnly }); } catch (e) { return fail(e.message); }
    const gifts = [];
    if (user) {
      for (const pid of giftKeys) {
        const flavor = b.gifts[pid];
        const p = byId.get(+pid), f = p?.flavors.find(x => x.name === flavor);
        if (!p || !f) return fail('赠品口味不对，请刷新页面再试');
        if (out.has(`${p.id}-${f.name}`)) return fail(`赠品 ${shortName(p)} · ${f.nameCn} 刚卖完了，请在购物车换一个口味`);
        gifts.push({ pid: p.id, name: shortName(p), flavor: f.name, flavorCn: f.nameCn });
      }
    }

    // IceMax clearance stock leaks a little: the buyer has to say they saw that (a free gift counts too)
    const leak = priced.leak || gifts.some(g => byId.get(g.pid).clearance);
    if (leak && b.form?.ackLeak !== true) return fail('IceMax 清仓款存在少量漏油，请先在结算页勾选「我已看清」再提交');
    priced.leak = leak;

    const o = { no: orderNo(), created: Date.now(), status: 'pending', member: user ? user.id : null, ...priced, gifts };
    if (gifts.length) {
      // one statement takes the 10 stamps off every gifted card, or none if any card isn't full,
      // so two tabs can't spend one full card twice
      const after = await addStamps(user.id, Object.fromEntries(gifts.map(g => [g.pid, -STAMPS_PER_REWARD])), { strict: true });
      if (!after) return fail('有一张卡的章还没集满，赠品已从购物车拿掉，请刷新页面');
    }
    o.tgText = orderText(o);
    try {
      await insertOrder(o);
    } catch (e) {
      if (gifts.length) await addStamps(user.id, Object.fromEntries(gifts.map(g => [g.pid, STAMPS_PER_REWARD])));
      throw e;
    }

    const chat = tgChat();
    if (chat) {
      const msg = await tg('sendMessage', { chat_id: chat, text: o.tgText, parse_mode: 'HTML', reply_markup: pendingKeyboard(o) });
      if (msg) await setOrderFields(o.no, { tg_message: msg.message_id });
    } else {
      console.log('[order] TG_CHAT_ID not set; order stored only:', o.no);
    }

    return json({ no: o.no, status: o.status, sub: o.sub, ship: o.ship, total: o.total, earn: o.earn, gifts: o.gifts, member: !!user });
  } catch (e) {
    console.error('[order]', e);
    return fail('服务器出错了，订单没有提交，请稍后再试', 500);
  }
};

// at most 8 orders a minute from one address: a real customer never gets near it, a script sending fake orders does
export const config = { path: '/api/order', rateLimit: { windowLimit: 8, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
