// Run after npm run build: node tests/security-smoke.cjs
// Uses only synthetic credentials; no production env files or external services.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHmac } = require('node:crypto');
const net = require('node:net');
const twilio = require('twilio');

async function main() {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const secret = 'local-smoke-only-secret-at-least-32-characters';
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: require('node:path').resolve(__dirname, '..'),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
      DISCADOR_LOGIN: 'smoke', DISCADOR_SENHA: 'synthetic-password', DISCADOR_AUTH_SECRET: secret,
      AGENTE_VOZ_ENABLED: 'false', AGENTE_VOZ_WEBHOOK_SECRET: 'synthetic-webhook',
      AGENTE_VOZ_SECRET: 'synthetic-result', TWILIO_AUTH_TOKEN: 'synthetic-twilio',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout.on('data', data => { logs += data; });
  server.stderr.on('data', data => { logs += data; });
  const base = `http://127.0.0.1:${port}`;
  const request = (path, options = {}) => fetch(base + path, { redirect: 'manual', ...options });
  const post = (body, headers = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(logs);
      try { ready = (await request('/login')).status === 200; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(ready, logs);
    let response = await request('/');
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get('location')).pathname, '/login');
    for (const path of ['/api/fila', '/api/ligacoes', '/api/token', '/api/voice/status', '/api/agente/iniciar', '/api/leads/bloquear', '/api/leads/retorno', '/api/voice/extra']) {
      assert.equal((await request(path)).status, 401, path);
      assert.equal((await request(path, { headers: { 'x-middleware-subrequest': 'middleware:middleware:middleware:middleware:middleware' } })).status, 401, path + ' bypass');
    }
    for (const payload of ['forged.signature', (() => {
      const body = Buffer.from(JSON.stringify({ sub: 'smoke', exp: 1 })).toString('base64url');
      return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
    })()]) {
      assert.equal((await request('/api/fila', { headers: { Cookie: 'discador_evs_session=' + payload } })).status, 401);
    }
    assert.equal((await request('/api/auth/login', post({ login: 'smoke', senha: 'wrong' }))).status, 401);
    response = await request('/api/auth/login', post({ login: 'smoke', senha: 'synthetic-password' }));
    assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /Secure/i); assert.match(setCookie, /SameSite=lax/i);
    const headers = { Cookie: setCookie.split(';')[0] };
    assert.deepEqual(await (await request('/api/auth/session', { headers })).json(), { authenticated: true, user: 'smoke' });
    assert.deepEqual(await (await request('/api/auth/session')).json(), { authenticated: false, user: null });
    assert.equal((await request('/', { headers })).status, 200);
    assert.equal((await request('/login', { headers })).status, 307);
    assert.equal((await request('/api/voice/status?sid=bad', { headers })).status, 400);
    response = await request('/api/auth/logout', { method: 'POST', headers });
    assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /Max-Age=0/i);
    console.log('PASS login, session, logout cookie, signed/expired tokens, protected routes and middleware bypass regression');

    for (const path of ['/api/agente/webhook', '/api/agente/diagnostico', '/api/agente/resultado']) {
      assert.equal((await request(path, post({}))).status, 401, path);
      assert.equal((await request(path, post({}, { Authorization: 'Bearer wrong' }))).status, 401, path);
    }
    assert.equal((await request('/api/agente/webhook', post({}, { Authorization: 'Bearer synthetic-webhook' }))).status, 503);
    assert.equal((await request('/api/agente/resultado', post({}, { Authorization: 'Bearer synthetic-result' }))).status, 400);
    // Malformed JSON stops the authenticated diagnostic before any Sheets read.
    response = await request('/api/agente/diagnostico', { method: 'POST', headers: { Authorization: 'Bearer synthetic-webhook', 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(response.status, 500);
    for (const method of ['GET', 'POST']) {
      response = await request('/api/voice', method === 'POST' ? { method, body: '', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } } : {});
      assert.equal(response.status, 403);
      const signature = twilio.getExpectedTwilioSignature('synthetic-twilio', base + '/api/voice', {});
      response = await request('/api/voice', { method, headers: { 'x-twilio-signature': signature, 'Content-Type': 'application/x-www-form-urlencoded' }, ...(method === 'POST' ? { body: '' } : {}) });
      assert.equal(response.status, 200);
      const xml = await response.text(); assert.match(xml, /<Say/); assert.doesNotMatch(xml, /<Dial/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    console.log('PASS public Twilio/Pabbly routes reach their own authentication, reject invalid credentials and accept synthetic valid credentials without calls');
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    server.kill('SIGTERM');
    await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
