// Cloudflare Worker (Modules syntax) + KV
//
// Bindings required:
// - KV namespace: TABGROUP_AUTO_SYNC_KV
//
// Routes:
// - PUT /v1/snapshot/:workspaceId
// - GET /v1/snapshot/:workspaceId
// - PUT /v1/config/:workspaceId
// - GET /v1/config/:workspaceId

function withCors(headers = {}) {
    return {
        ...headers,
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,PUT,OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400'
    };
}

function jsonResponse(status, data) {
    return new Response(JSON.stringify(data), {
        status,
        headers: withCors({
            'content-type': 'application/json; charset=utf-8'
        })
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname || '';

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: withCors() });
        }

        const matchSnapshot = path.match(/^\/v1\/snapshot\/([a-f0-9]{64})$/i);
        const matchConfig = path.match(/^\/v1\/config\/([a-f0-9]{64})$/i);
        if (!matchSnapshot && !matchConfig) {
            return jsonResponse(404, { error: 'Not found' });
        }
        const workspaceId = (matchSnapshot ? matchSnapshot[1] : matchConfig[1]);

        const kv = env.TABGROUP_AUTO_SYNC_KV;
        if (!kv) {
            return jsonResponse(500, { error: 'KV binding TABGROUP_AUTO_SYNC_KV not configured' });
        }

        const key = matchSnapshot ? `snap:${workspaceId}` : `cfg:${workspaceId}`;

        if (request.method === 'GET') {
            const value = await kv.get(key);
            if (!value) {
                return jsonResponse(404, { error: 'Snapshot not found' });
            }
            return new Response(value, {
                status: 200,
                headers: withCors({
                    'content-type': 'application/json; charset=utf-8'
                })
            });
        }

        if (request.method === 'PUT') {
            let payload;
            try {
                payload = await request.json();
            } catch (e) {
                return jsonResponse(400, { error: 'Invalid JSON' });
            }

            if (!payload || payload.v !== 1 || !payload.iv || !payload.ciphertext) {
                return jsonResponse(400, { error: 'Invalid payload' });
            }

            // Store as-is. Payload is expected to be encrypted (server stores ciphertext only).
            const stored = JSON.stringify(payload);
            await kv.put(key, stored);

            return jsonResponse(200, { ok: true });
        }

        return jsonResponse(405, { error: 'Method not allowed' });
    }
};
