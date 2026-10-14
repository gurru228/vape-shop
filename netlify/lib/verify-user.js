const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Returns { id, email } for a valid `Authorization: Bearer <access_token>`
// header, or null for guests / missing / invalid tokens. Never trust a user id
// or email sent in the request body.
async function getVerifiedUser(headers) {
    const authHeader = (headers && (headers['authorization'] || headers['Authorization'])) || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;

    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${match[1]}` }
        });
        if (!res.ok) {
            console.warn('Access token rejected by Supabase Auth:', res.status);
            return null;
        }
        const user = await res.json();
        if (!user || typeof user.id !== 'string') return null;
        return { id: user.id, email: typeof user.email === 'string' ? user.email : null };
    } catch (err) {
        console.error('Access token verification failed:', err);
        return null;
    }
}

async function getVerifiedUserId(headers) {
    const user = await getVerifiedUser(headers);
    return user ? user.id : null;
}

module.exports = { getVerifiedUser, getVerifiedUserId };
