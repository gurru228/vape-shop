// Member accounts: register / login / logout / me (GET profile, DELETE account) / password (change).
import {
  json, fail, body, normAccount, hashPassword, checkPassword, newSession, dropSession, currentUser, publicUser, bearer,
  getMember, createMember, patchMember, deleteMember, memberOrders, customerStatus, legacyLogin, db,
} from '../lib/shop.mjs';

const MIN = 6e4;

async function me(user) {
  const recent = await memberOrders(user.id, 5);
  return {
    user: publicUser(user),
    orders: recent.map(o => ({ no: o.no, status: customerStatus(o.status), created: o.created, total: o.total, earn: o.earn, gifts: o.gifts.map(g => g.pid) })),
  };
}

export default async req => {
  const route = new URL(req.url).pathname.split('/').pop();
  try {
    if (route === 'register' && req.method === 'POST') {
      const b = await body(req);
      const acct = normAccount(b?.account), name = String(b?.name || '').trim().slice(0, 40), password = String(b?.password || '');
      if (!acct) return fail(String(b?.account || '').includes('@') ? '邮箱格式不对' : '手机号看起来不完整（西班牙号码 9 位，其他国家请加区号）');
      if (!name) return fail('请填写怎么称呼你');
      if (password.length < 6) return fail('密码至少 6 位');
      if (b?.adult !== true) return fail('需要确认你已满 18 岁');
      const user = { ...acct, name, ...(await hashPassword(password)), stamps: {} };
      if (!(await createMember(user))) return fail(`这个${acct.email ? '邮箱' : '手机号'}已经注册过了，请直接登录`, 409);
      return json({ token: await newSession(acct.id), user: publicUser(user), orders: [] });
    }

    if (route === 'login' && req.method === 'POST') {
      const b = await body(req);
      const acct = normAccount(b?.account), password = String(b?.password || '');
      let user = acct && await getMember(acct.id);
      // an account from the old site (Supabase Auth, email only): check its password there once, then move it over
      if (!user && acct?.email) {
        const old = await legacyLogin(acct.email, password);
        if (old) {
          const fresh = { ...acct, name: (old.name || acct.email.split('@')[0]).slice(0, 40), ...(await hashPassword(password)), stamps: {}, authUid: old.authUid };
          await createMember(fresh);
          // their orders on the old site show up under "my orders" (no stamps for those, the card starts empty)
          await db(`orders?user_id=eq.${old.authUid}&member_id=is.null`, { method: 'PATCH', body: { member_id: acct.id }, prefer: 'return=minimal' }).catch(e => console.error('[legacy orders]', e.message));
          user = await getMember(acct.id);
          return json({ token: await newSession(user.id), ...(await me(user)), moved: true });
        }
      }
      if (!user) return fail('账号或密码不对', 401);
      if (user.lockUntil > Date.now()) return fail(`试错太多次了，请 ${Math.ceil((user.lockUntil - Date.now()) / MIN)} 分钟后再试`, 429);
      if (!(await checkPassword(password, user))) {
        const fails = (user.fails || 0) + 1;
        await patchMember(user.id, fails >= 8 ? { fails: 0, lockUntil: Date.now() + 15 * MIN } : { fails });
        return fail('账号或密码不对', 401);
      }
      if (user.fails || user.lockUntil) await patchMember(user.id, { fails: 0, lockUntil: 0 });
      return json({ token: await newSession(user.id), ...(await me(user)) });
    }

    if (route === 'logout' && req.method === 'POST') {
      const token = bearer(req);
      if (/^[0-9a-f]{64}$/.test(token)) await dropSession(token);
      return json({ ok: true });
    }

    if (route === 'password' && req.method === 'POST') {
      const auth = await currentUser(req);
      if (!auth) return fail('请重新登录', 401);
      const b = await body(req);
      const next = String(b?.next || '');
      if (!(await checkPassword(String(b?.current || ''), auth.user))) return fail('现在的密码不对');
      if (next.length < 6) return fail('新密码至少 6 位');
      if (next === b.current) return fail('新密码要和原来的不一样');
      // every other device signs out; this one gets a fresh session
      const user = await patchMember(auth.user.id, { ...(await hashPassword(next)), tempPw: false, sessionsAfter: Date.now() });
      if (!user) return fail('请重新登录', 401);
      await dropSession(auth.token);
      return json({ token: await newSession(user.id), ...(await me(user)) });
    }

    if (route === 'me') {
      const auth = await currentUser(req);
      if (!auth) return fail('请重新登录', 401);
      if (req.method === 'GET') return json(await me(auth.user));
      if (req.method === 'DELETE') {
        // GDPR: the account, its stamps and sessions go; orders already sent to the shop stay for its records
        await deleteMember(auth.user.id);
        return json({ ok: true });
      }
    }
    return fail('not found', 404);
  } catch (e) {
    console.error('[auth]', route, e);
    return fail('服务器出错了，请稍后再试', 500);
  }
};

export const config = { path: ['/api/register', '/api/login', '/api/logout', '/api/me', '/api/password'] };
