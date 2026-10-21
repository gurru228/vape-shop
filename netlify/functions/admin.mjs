// Admin-page endpoints for the stamp card (same ADMIN_PASSWORD as the rest of admin.html):
//   GET  /api/admin/members?password=…              members with their stamps
//   POST /api/admin/stamp   {password, id, pid, n}  add / take stamps by hand (logged like Telegram's 盖)
//   POST /api/admin/status  {password, orderId, status}
//        changes an order's status through the same path as Telegram's buttons: stamps, gift refunds and
//        stock all follow, and the order's Telegram message is updated. Replaces update-order for admin.html.
import {
  json, fail, body, listMembers, getMember, addStamps, byId, getOrderById, setStatus, syncTelegram, STATUS_CN,
} from '../lib/shop.mjs';

const authed = pw => process.env.ADMIN_PASSWORD && pw === process.env.ADMIN_PASSWORD;

export default async req => {
  const url = new URL(req.url);
  const route = url.pathname.split('/').pop();
  try {
    if (route === 'members' && req.method === 'GET') {
      if (!authed(url.searchParams.get('password'))) return fail('Unauthorized', 401);
      const members = await listMembers();
      return json({ members: members.map(u => ({ id: u.id, name: u.name, phone: u.phone, email: u.email, stamps: u.stamps, tempPw: !!u.tempPw, created: u.created })) });
    }
    const b = await body(req);
    if (!authed(b?.password)) return fail('Unauthorized', 401);

    if (route === 'stamp' && req.method === 'POST') {
      const n = Math.trunc(+b.n), p = byId.get(+b.pid);
      if (!p || !n || Math.abs(n) > 50) return fail('款式或数量不对');
      const u = await getMember(String(b.id || ''));
      if (!u) return fail('找不到这个会员', 404);
      const stamps = await addStamps(u.id, { [p.id]: n }, { log: { at: Date.now(), pid: p.id, n, by: 'admin' } });
      return json({ id: u.id, stamps });
    }

    if (route === 'status' && req.method === 'POST') {
      if (!STATUS_CN[b.status]) return fail('状态不对');
      const o = await getOrderById(String(b.orderId || ''));
      if (!o) return fail('找不到这个订单', 404);
      const r = await setStatus(o, b.status);
      if (!r.changed) return json({ success: true, unchanged: true, status: (await getOrderById(o.id))?.status });
      await syncTelegram(r.order, r.user, '后台');
      return json({ success: true, oldStatus: r.prev, newStatus: r.order.status, stamped: r.order.stamped, member: r.order.member, stamps: r.user?.stamps || null });
    }
    return fail('not found', 404);
  } catch (e) {
    console.error('[admin]', route, e);
    return fail(e.message, 500);
  }
};

export const config = { path: ['/api/admin/members', '/api/admin/stamp', '/api/admin/status'] };
