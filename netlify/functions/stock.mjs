// Public stock list for the storefront: which flavors the admin marked as 0 (sold out).
import { json, soldOut } from '../lib/shop.mjs';

export default async () => {
  const out = await soldOut();
  return Response.json({ out: [...out] }, { headers: { 'cache-control': 'public, max-age=60' } });
};

export const config = { path: '/api/stock', rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
