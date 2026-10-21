// Telegram bot webhook: the shop taps ✅ / ❌ under an order notification.
// ✅ confirms and stamps the member's cards; ❌ (asked twice) cancels and refunds any gift stamps.
// In the shop's chat the bot also takes admin commands: 查 (look up a member), 盖 (add / remove stamps by hand),
// 重置 (temporary password). /api/tg-setup?key=<TG_SECRET> registers this webhook with Telegram once after deploying.
import {
  json, fail, tg, tgChat, tgLastError, byId, shortName, STAMPS_PER_REWARD, pendingKeyboard, waButton,
  normAccount, showPhone, esc, euro, hashPassword, tempPassword,
  getMember, patchMember, searchMembers, addStamps, memberOrders, getOrder, setStatus, statusLine, STATUS_CN,
} from '../lib/shop.mjs';

const ok = () => json({ ok: true });
// answer a message in the webhook response itself: one round trip less, and testable without a bot token
const reply = (chat, text, keyboard) => json({ method: 'sendMessage', chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) });
const madrid = (t, opts = { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) => new Date(t).toLocaleString('zh-CN', { timeZone: 'Europe/Madrid', ...opts });
const STATUS = STATUS_CN;
const products = [...byId.values()];
const who = u => esc(u.email || showPhone(u.phone || u.id));
const waTo = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

const HELP = `<b>店家指令</b>（只在这个聊天里有效，斜杠可写可不写）

<b>查</b> 手机号 / 邮箱 / 名字 / 订单号
看这个人的章和最近订单
例：<code>查 612345678</code>

<b>盖</b> 手机号或邮箱 款式 数量
店里现场买的手动补章，写负数就是扣章
例：<code>盖 612345678 鸭嘴兽 3</code>
例：<code>盖 a@b.com 冰王 -1</code>

<b>重置</b> 手机号或邮箱
生成临时密码，点按钮用 WhatsApp 发给顾客；顾客登录后网站会提醒改密码
例：<code>重置 612345678</code>

款式可以写：${products.map(p => esc(shortName(p).split(' ')[0])).join(' · ')}`;

function stampLines(u) {
  return products.map(p => {
    const n = u.stamps?.[p.id] || 0;
    if (!n) return null;
    return `${n >= STAMPS_PER_REWARD ? '🎁' : '·'} ${esc(shortName(p))}  <b>${Math.min(n, STAMPS_PER_REWARD)}/10</b>${n >= STAMPS_PER_REWARD ? '  满了，下单可领赠品' : ''}${n > STAMPS_PER_REWARD ? `（多出 ${n - STAMPS_PER_REWARD}）` : ''}`;
  }).filter(Boolean).join('\n') || '· 还没有章';
}

async function memberCard(u) {
  const recent = await memberOrders(u.id, 5);
  const list = recent.map(o => `${STATUS[o.status] || o.status}  <code>${o.no}</code>  ${madrid(o.created, { month: 'numeric', day: 'numeric' })} · ${euro(o.total)}`).join('\n');
  return [
    `👤 <b>${esc(u.name)}</b> · ${who(u)}`,
    `注册于 ${madrid(u.created, { year: 'numeric', month: 'numeric', day: 'numeric' })}${u.tempPw ? ' · 正在用临时密码' : ''}${u.lockUntil > Date.now() ? ' · 🔒 密码试错太多，暂时锁住' : ''}`,
    '',
    '<b>集章</b>',
    stampLines(u),
    '',
    recent.length ? `<b>最近订单</b>\n${list}` : '还没有在网站下过单',
  ].join('\n');
}

// a member by phone / email, or failing that by (part of) the name
async function findMembers(q) {
  const acct = normAccount(q);
  const hit = acct && await getMember(acct.id);
  if (hit) return [hit];
  const needle = q.trim();
  return needle ? searchMembers(needle) : [];
}
const matchProduct = q => {
  const k = q.trim().toLowerCase();
  if (!k) return [];
  return products.filter(p => [p.name, shortName(p), p.nameEs].some(n => n.toLowerCase().includes(k)));
};

async function command(chat, text) {
  const m = text.trim().match(/^\/?(\S+?)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  const cmd = (m?.[1] || '').toLowerCase(), arg = (m?.[2] || '').trim();

  if (['查', 'find', 'cha'].includes(cmd)) {
    if (!arg) return reply(chat, '要查谁？例：<code>查 612345678</code>');
    if (/^vs[0-9a-z]{5,}$/i.test(arg)) {
      const o = await getOrder(arg.toUpperCase());
      if (!o) return reply(chat, `找不到订单 <code>${esc(arg)}</code>`);
      return reply(chat, `${o.tgText || '<b>' + o.no + '</b>（老网站的订单）'}\n\n${STATUS[o.status] || o.status}${o.decided ? ' · ' + madrid(o.decided) : ''}`, [[waButton(o)]]);
    }
    const found = await findMembers(arg);
    if (!found.length) return reply(chat, `没有找到「${esc(arg)}」这个会员。\n手机号试试带不带 +34，或者用邮箱、名字查。`);
    if (found.length > 1) return reply(chat, `找到 ${found.length} 个会员，用手机号或邮箱再查一次：\n\n${found.map(u => `· ${esc(u.name)} · <code>${who(u)}</code>`).join('\n')}`);
    const u = found[0];
    return reply(chat, await memberCard(u), u.phone ? [[{ text: '💬 WhatsApp 联系', url: `https://wa.me/${u.phone}` }]] : null);
  }

  if (['盖', 'stamp', 'gai'].includes(cmd)) {
    const usage = '格式：<code>盖 手机号或邮箱 款式 数量</code>\n例：<code>盖 612345678 鸭嘴兽 3</code>（扣章写 -1）';
    const words = arg.split(/\s+/).filter(Boolean);
    let n = 1;
    if (words.length && /^[+-]?\d{1,2}$/.test(words[words.length - 1])) n = parseInt(words.pop(), 10);
    if (words.length < 2 || !n) return reply(chat, usage);
    // the style is the longest tail of the words that names exactly one line; everything before it is the account
    let p = null, cut = -1, many = null;
    for (let i = 1; i < words.length; i++) {
      const hits = matchProduct(words.slice(i).join(' '));
      if (hits.length === 1) { p = hits[0]; cut = i; break; }
      if (hits.length > 1 && !many) many = hits;
    }
    if (!p) return reply(chat, many ? `「${esc(words.slice(1).join(' '))}」对上了好几款：${many.map(x => esc(shortName(x))).join('、')}，写全一点。` : `没认出款式。可以写：${products.map(x => esc(shortName(x).split(' ')[0])).join(' · ')}\n\n${usage}`);
    const acct = normAccount(words.slice(0, cut).join(' '));
    if (!acct) return reply(chat, `「${esc(words.slice(0, cut).join(' '))}」不像手机号或邮箱。\n\n${usage}`);
    const u = await getMember(acct.id);
    if (!u) return reply(chat, `没有找到 <code>${esc(acct.id)}</code> 这个会员。先用 <code>查</code> 确认一下。`);
    const before = u.stamps?.[p.id] || 0;
    const stamps = await addStamps(u.id, { [p.id]: n }, { log: { at: Date.now(), pid: p.id, n, by: 'telegram' } });
    const after = stamps?.[p.id] || 0;
    if (after === before) return reply(chat, `${esc(u.name)} 的 ${esc(shortName(p))} 现在就是 ${before} 个章，没有变化。`);
    const full = after >= STAMPS_PER_REWARD;
    return reply(chat, `${after > before ? '✅ 已盖章' : '↩︎ 已扣章'} · ${esc(u.name)}（${who(u)}）\n${esc(shortName(p))}：${before} → <b>${Math.min(after, STAMPS_PER_REWARD)}/10</b>${full ? '\n🎁 满了，顾客下次在网站下单会自动带一份赠品' : ''}`);
  }

  if (['重置', 'reset', 'chongzhi'].includes(cmd)) {
    const acct = normAccount(arg);
    if (!acct) return reply(chat, '格式：<code>重置 手机号或邮箱</code>');
    const pw = tempPassword();
    const hashed = await hashPassword(pw);
    const u = await patchMember(acct.id, { ...hashed, tempPw: true, fails: 0, lockUntil: 0, sessionsAfter: Date.now() });
    if (!u) return reply(chat, `没有找到 <code>${esc(acct.id)}</code> 这个会员。先用 <code>查</code> 确认一下。`);
    const msg = `你好 ${u.name}，你的集章卡临时密码是：${pw}\n用 ${u.email || showPhone(u.phone)} 登录后，网站会提醒你改一个新密码。集的章都还在 😊`;
    return reply(chat, `🔑 已为 <b>${esc(u.name)}</b>（${who(u)}）生成临时密码：\n\n<code>${pw}</code>\n\n旧密码已失效，所有设备已退出登录。${u.phone ? '点下面的按钮用 WhatsApp 发给顾客：' : '这是邮箱账户，请复制上面的密码，用你和顾客平时联系的方式发过去。'}`,
      u.phone ? [[{ text: '💬 用 WhatsApp 发给顾客', url: waTo(u.phone, msg) }]] : null);
  }

  if (['help', 'start', '帮助', '指令', 'menu'].includes(cmd)) return reply(chat, HELP);
  return reply(chat, `已连接 ✅ 新订单会发到这里。\n发 <code>帮助</code> 看看能用的指令。`);
}

export default async req => {
  const url = new URL(req.url);
  const secret = process.env.TG_SECRET;
  if (!secret) return fail('TG_SECRET 没有设置', 500);

  if (url.pathname.endsWith('/tg-setup')) {
    if (url.searchParams.get('key') !== secret) return fail('forbidden', 403);
    // the address this was opened on (Netlify's URL variable always points at the production site, even on a preview)
    const hook = `${url.origin}/api/telegram`;
    const r = await tg('setWebhook', { url: hook, secret_token: secret, allowed_updates: ['message', 'callback_query'] });
    const said = tgLastError;
    // the "/" menu in Telegram (command names there can only be latin; the Chinese words work as plain messages)
    await tg('setMyCommands', { commands: [
      { command: 'find', description: '查会员：/find 手机号或邮箱' },
      { command: 'stamp', description: '补章/扣章：/stamp 手机号 鸭嘴兽 3' },
      { command: 'reset', description: '临时密码：/reset 手机号' },
      { command: 'help', description: '所有指令' },
    ] });
    return json({ webhook: hook, ok: r === true, chatIdSet: !!tgChat(), ...(r === true ? {} : { telegramSaid: said }) });
  }

  if (req.method !== 'POST' || req.headers.get('x-telegram-bot-api-secret-token') !== secret) return fail('forbidden', 403);
  const up = await req.json().catch(() => ({}));
  try { return await handle(up); } catch (e) { console.error('[telegram]', e); return ok(); }
};

async function handle(up) {

  // the shop's chat gets the admin commands; any other chat is only told its id, so the shop can copy it into TG_CHAT_ID
  if (up.message) {
    const chat = up.message.chat.id;
    if (String(chat) !== String(tgChat())) return reply(chat, `这个聊天的 ID 是：<code>${chat}</code>\n把它填到 Netlify 的 TG_CHAT_ID，新订单就会发到这里。`);
    if (typeof up.message.text !== 'string') return ok();
    try { return await command(chat, up.message.text); } catch (e) { console.error('[tg command]', e); return reply(chat, '出错了，稍后再试一次'); }
  }

  const cq = up.callback_query;
  if (!cq) return ok();
  const answer = text => tg('answerCallbackQuery', { callback_query_id: cq.id, text });
  if (String(cq.message?.chat?.id) !== String(tgChat())) { await answer('没有权限'); return ok(); }

  const [act, no] = String(cq.data || '').split(':');
  const o = no && await getOrder(no);
  if (!o) { await answer('找不到这个订单'); return ok(); }
  const edit = (status, keyboard) => tg('editMessageText', {
    chat_id: cq.message.chat.id, message_id: cq.message.message_id, parse_mode: 'HTML',
    text: status ? `${o.tgText}\n\n${status}` : o.tgText, reply_markup: keyboard,
  });

  if (o.status !== 'pending') { await answer(`这单已经是「${STATUS[o.status].replace(/^\S+\s/, '')}」了`); return ok(); }

  if (act === 'no?') {
    await edit('确定要取消这单吗？', { inline_keyboard: [[{ text: '❌ 确定取消', callback_data: `no!:${o.no}` }, { text: '↩︎ 不取消', callback_data: `back:${o.no}` }]] });
    await answer('');
    return ok();
  }
  if (act === 'back') { await edit('', pendingKeyboard(o)); await answer(''); return ok(); }

  // setStatus flips the status only if it's still pending, so a double tap or a Telegram retry can never stamp twice
  const next = act === 'ok' ? 'paid' : act === 'no!' ? 'cancelled' : null;
  if (!next) { await answer(''); return ok(); }
  const r = await setStatus(o, next);
  if (!r.changed) { await answer('这单已经处理过了'); return ok(); }
  await edit(statusLine(r.order, r.user), { inline_keyboard: [[waButton(o)]] });
  await answer(next === 'paid' ? '已确认' : '已取消');
  return ok();
};

export const config = { path: ['/api/telegram', '/api/tg-setup'] };
