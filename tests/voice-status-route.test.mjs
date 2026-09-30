import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { callOutcome } from '../lib/call-outcome.mjs';

const sid = `CA${'a'.repeat(32)}`;
function route({ from = 'client:vendedora', configured = true, status = 'no-answer' } = {}) {
  let reads = 0;
  const calls = () => ({ fetch: async () => { reads++; return { sid, from, status: 'completed' }; } });
  calls.list = async () => { reads++; return [{ parentCallSid: sid, status }]; };
  const context = vm.createContext({
    URL, Response, console, callOutcome,
    process: { env: configured ? { TWILIO_ACCOUNT_SID: 'test', TWILIO_AUTH_TOKEN: 'test' } : {} },
    twilio: () => ({ calls }),
  });
  let code = fs.readFileSync(new URL('../app/api/voice/status/route.js', import.meta.url), 'utf8');
  code = code.replace(/^import .+;$/gm, '').replaceAll('export ', '') + '\nglobalThis.get = GET;';
  vm.runInContext(code, context);
  return { get: (value = sid) => context.get({ url: `https://test.invalid/api/voice/status?sid=${value}` }), reads: () => reads };
}
test('status route reports child outcome without returning contact or credentials', async () => {
  const h = route(); const response = await h.get();
  const body = await response.json();
  assert.equal(body.noAnswer, true); assert.equal(body.terminal, true);
  assert.equal(h.reads(), 2); assert.equal(body.from, undefined); assert.equal(body.sid, undefined);
});
test('rejects malformed IDs, missing configuration and other types of calls', async () => {
  let h = route(); assert.equal((await h.get('bad')).status, 400); assert.equal(h.reads(), 0);
  h = route({ configured: false }); assert.equal((await h.get()).status, 503); assert.equal(h.reads(), 0);
  h = route({ from: '+5500000000000' }); assert.equal((await h.get()).status, 404); assert.equal(h.reads(), 1);
});
