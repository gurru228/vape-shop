// Visit notice: the storefront calls this once when someone opens the site (again after 30 minutes away),
// and the shop's Telegram gets a short line: when, where from (QR code / WhatsApp / Instagram / …),
// which city, which device, and the member's name if they are signed in.
// Safe to leave public: it only ever posts this fixed format (no free text from the visitor), bots are
// skipped, and Netlify limits each address to a few calls a minute. VISIT_NOTIFY=off turns it off.
import { json, tg, tgChat, esc, currentUser, showPhone } from '../lib/shop.mjs';

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|monitor|curl|wget|python|node-fetch/i;
const madrid = () => new Date().toLocaleString('zh-CN', { timeZone: 'Europe/Madrid', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function device(ua) {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android 手机' : 'Android 平板';
  if (/Macintosh/.test(ua)) return 'Mac 电脑';
  if (/Windows/.test(ua)) return 'Windows 电脑';
  return '其他设备';
}
// where they came from: our QR code, a known app, another site, or typed / bookmarked
function source(from, ref, ua) {
  if (from === 'qr') return '📷 扫二维码';
  if (/MicroMessenger/i.test(ua)) return '微信';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV/i.test(ua)) return 'Facebook';
  if (/TikTok|musical_ly|Bytedance/i.test(ua)) return 'TikTok';
  let host = '';
  try { host = new URL(ref).hostname.replace(/^www\./, ''); } catch (e) { /* no referrer */ }
  if (!host) return '直接打开 / 收藏';
  if (/whatsapp/.test(host)) return 'WhatsApp 链接';
  if (/google\./.test(host)) return 'Google';
  if (/instagram/.test(host)) return 'Instagram';
  if (/facebook|fb\.com/.test(host)) return 'Facebook';
  if (/t\.me|telegram/.test(host)) return 'Telegram';
  return host.slice(0, 40);
}

export default async (req, context) => {
  if (req.method !== 'POST') return json({ ok: false }, 405);
  if (String(process.env.VISIT_NOTIFY || '').toLowerCase() === 'off' || !tgChat()) return json({ ok: true, off: true });
  const ua = req.headers.get('user-agent') || '';
  if (!ua || BOT.test(ua)) return json({ ok: true, bot: true });
  const b = await req.json().catch(() => ({}));
  const from = b?.from === 'qr' ? 'qr' : '';
  const ref = typeof b?.ref === 'string' ? b.ref.slice(0, 300) : '';
  const geo = context?.geo || {};
  const place = [geo.city, geo.country?.name || geo.country?.code].filter(Boolean).join(', ') || '未知地区';
  let who = '游客';
  try { const u = (await currentUser(req))?.user; if (u) who = `会员 ${esc(u.name)}（${esc(u.email || showPhone(u.phone || u.id))}）`; } catch (e) { /* not signed in */ }
  const text = [
    `👀 <b>有人进网站</b> · ${madrid()}`,
    `来源：${esc(source(from, ref, ua))}`,
    `📍 ${esc(place)} · 📱 ${device(ua)}`,
    who,
  ].join('\n');
  await tg('sendMessage', { chat_id: tgChat(), text, parse_mode: 'HTML', disable_web_page_preview: true });
  return json({ ok: true });
};

// a real visitor sends one of these per half hour; 5 a minute per address leaves room and stops floods
export const config = { path: '/api/visit', rateLimit: { windowLimit: 5, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
