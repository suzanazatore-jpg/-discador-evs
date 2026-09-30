import test from 'node:test';
import assert from 'node:assert/strict';
import { callOutcome, readCallOutcome } from '../lib/call-outcome.mjs';

const sid = `CA${'a'.repeat(32)}`;
const parent = { sid, status: 'completed' };
test('completed browser leg is not customer pickup', () => {
  assert.equal(callOutcome(parent, []).answered, false);
  assert.equal(callOutcome(parent, []).status, 'unknown');
  for (const status of ['no-answer', 'busy']) {
    const result = callOutcome(parent, [{ parentCallSid: sid, status }]);
    assert.equal(result.noAnswer, true);
    assert.equal(result.terminal, true);
    assert.equal(result.answered, false);
  }
});
test('answered, technical failure and live conversations remain distinct', () => {
  assert.equal(callOutcome(parent, [{ parentCallSid: sid, status: 'completed', duration: '17' }]).duration, 17);
  for (const status of ['failed', 'canceled', 'in-progress', 'ringing']) {
    const result = callOutcome(parent, [{ parentCallSid: sid, status }]);
    assert.equal(result.noAnswer, false);
    assert.equal(result.terminal, ['failed', 'canceled'].includes(status));
  }
  assert.equal(callOutcome(parent, [{ parentCallSid: 'different', status: 'no-answer' }]).noAnswer, false);
});
test('eventual status is retried, without starting a call', async () => {
  let count = 0;
  const result = await readCallOutcome(sid, {
    wait: async () => {},
    request: async (url, options) => {
      assert.equal(url, `/api/voice/status?sid=${sid}`);
      assert.equal(options.method, undefined);
      return { ok: true, status: 200, json: async () => ++count < 3
        ? { terminal: false, status: 'ringing' }
        : { terminal: true, status: 'no-answer', noAnswer: true } };
    },
  });
  assert.equal(count, 3);
  assert.equal(result.noAnswer, true);
});
test('authentication and status lookup failures never become no-answer', async () => {
  let calls = 0;
  await assert.rejects(readCallOutcome(sid, { request: async () => { calls++; return { status: 401 }; } }), /sessão expirou/);
  assert.equal(calls, 1);
  await assert.rejects(readCallOutcome(sid, { wait: async () => {}, request: async () => { throw new Error('offline'); } }), /offline/);
  await assert.rejects(readCallOutcome('bad'), /identificar/);
});
