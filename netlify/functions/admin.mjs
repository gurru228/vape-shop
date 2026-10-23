// Admin-page endpoints for the stamp card (same ADMIN_PASSWORD as the rest of admin.html):
//   GET  /api/admin/members?password=…              members with their stamps
//   POST /api/admin/stamp   {password, id, pid, n}  add / take stamps by hand (logged like Telegram's 盖)
//   POST /api/admin/status  {password, orderId, status}
//        changes an order's status through the same path as Telegram's buttons: stamps, gift refunds and
//        stock all follow, and the order's Telegram message is updated. Replaces update-order for admin.html.
// and for the 复购 page (customer_followups; until its migration has run, reads come back empty with ready: false):
//   GET  /api/admin/followups?password=…            every follow-up row
//   POST /api/admin/followup {password, key, reason?, note?, contacted?: 'now' | 'clear'}   fields left out stay as they are
import {
  json, fail, body, adminOk, slowNo, listMembers, getMember, addStamps, byId, getOrderById, setStatus, syncTelegram, STATUS_CN, db,
} from '../lib/shop.mjs';

const authed = pw => adminOk(pw);
// the table isn't there yet (migration not run): PostgREST answers 404 / PGRST205, older versions 42P01
const noTable = e => e.status === 404 || e.code === '42P01' || /^PGRST20[25]$/.test(e.code || '');
const MISSING = '跟进记录表还没建：先在 Supabase 运行 supabase/migrations/20261023000000_customer_followups.sql';
const toFollowup = r => ({ key: r.customer_key, reason: r.reason || '', note: r.note || '', contactedAt: r.contacted_at ? Date.parse(r.contacted_at) : null, updatedAt: Date.parse(r.updated_at) });

export default async req => {
  const url = new URL(req.url);
  const route = url.pathname.split('/').pop();
  try {
    if (route === 'members' && req.method === 'GET') {
      if (!authed(url.searchParams.get('password'))) return slowNo();
      const members = await listMembers();
      return json({ members: members.map(u => ({ id: u.id, name: u.name, phone: u.phone, email: u.email, stamps: u.stamps, tempPw: !!u.tempPw, created: u.created })) });
    }
    if (route === 'followups' && req.method === 'GET') {
      if (!authed(url.searchParams.get('password'))) return slowNo();
      try {
        const rows = await db('customer_followups?select=*&order=updated_at.desc');
        return json({ ready: true, followups: rows.map(toFollowup) });
      } catch (e) {
        if (noTable(e)) return json({ ready: false, followups: [], error: MISSING });
        throw e;
      }
    }
    const b = await body(req);
    if (!authed(b?.password)) return slowNo();

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
      if (r.refused) return fail(r.refused, 409);
      if (!r.changed) return json({ success: true, unchanged: true, status: (await getOrderById(o.id))?.status });
      await syncTelegram(r.order, r.user, '后台');
      return json({ success: true, oldStatus: r.prev, newStatus: r.order.status, stamped: r.order.stamped, member: r.order.member, stamps: r.user?.stamps || null });
    }

    if (route === 'followup' && req.method === 'POST') {
      const key = String(b.key || '');
      if (!/^[mpuo]:\S{1,160}$/.test(key)) return fail('顾客标识不对');
      // only the fields sent are changed, so a note and a 「已联系」 saved at the same moment don't undo each other
      const row = { customer_key: key, updated_at: new Date().toISOString() };
      if (b.reason !== undefined) row.reason = String(b.reason ?? '').trim() || null;
      if (b.note !== undefined) row.note = String(b.note ?? '').trim() || null;
      if ((row.reason || '').length > 40 || (row.note || '').length > 500) return fail('原因最多 40 个字，备注最多 500 个字');
      if (b.contacted === 'now') row.contacted_at = new Date().toISOString();
      else if (b.contacted === 'clear') row.contacted_at = null;
      try {
        const [saved] = await db('customer_followups?on_conflict=customer_key', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=representation' });
        return json({ success: true, followup: toFollowup(saved) });
      } catch (e) {
        if (noTable(e)) return fail(MISSING, 503);
        throw e;
      }
    }
    return fail('not found', 404);
  } catch (e) {
    console.error('[admin]', route, e);
    return fail(e.message, 500);
  }
};

export const config = { path: ['/api/admin/members', '/api/admin/stamp', '/api/admin/status', '/api/admin/followups', '/api/admin/followup'], rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
