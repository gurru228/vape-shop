// WhatsApp links without the shop's number in the page: the site links to /api/wa?text=…, and this
// sends the visitor on to wa.me/<number>. The number lives in the WA_NUMBER environment variable
// (digits with country code). WhatsApp itself still shows the number once the chat is open.
const FALLBACK = '34697332407'; // used until WA_NUMBER is set in Netlify

export default async req => {
  const num = String(process.env.WA_NUMBER || FALLBACK).replace(/\D/g, '');
  const text = (new URL(req.url).searchParams.get('text') || '').slice(0, 1500);
  const to = `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  return new Response(null, { status: 302, headers: { location: to, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
};

export const config = { path: '/api/wa', rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
