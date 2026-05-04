// Cloudflare Worker: void-presence
// KV binding name: PRESENCE_KV
// Environment secrets: WRITE_SECRET, READ_SECRET

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const auth = request.headers.get('Authorization') || '';
    const secret = auth.startsWith('Bearer ') ? auth.slice(7) : '';

    if (request.method === 'POST' && url.pathname === '/heartbeat') {
      if (secret !== env.WRITE_SECRET) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: cors });
      }
      const username = String(body.username || '').trim();
      if (!username) {
        return new Response(JSON.stringify({ error: 'username required' }), { status: 400, headers: cors });
      }
      const record = {
        username,
        playerId: body.playerId || null,
        version: body.version || null,
        lastSeen: Date.now(),
        debugPayload: body.debugPayload || null,
      };
      await env.PRESENCE_KV.put(username, JSON.stringify(record));
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (request.method === 'GET' && url.pathname === '/presence') {
      if (secret !== env.READ_SECRET) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      }
      const list = await env.PRESENCE_KV.list();
      const entries = await Promise.all(
        list.keys.map(async k => {
          const val = await env.PRESENCE_KV.get(k.name);
          return val ? JSON.parse(val) : null;
        })
      );
      return new Response(JSON.stringify(entries.filter(Boolean)), { headers: cors });
    }

    if (request.method === 'POST' && url.pathname === '/clear') {
      if (secret !== env.WRITE_SECRET) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      }
      const list = await env.PRESENCE_KV.list();
      await Promise.all(list.keys.map(k => env.PRESENCE_KV.delete(k.name)));
      return new Response(JSON.stringify({ ok: true, cleared: list.keys.length }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: cors });
  },
};
