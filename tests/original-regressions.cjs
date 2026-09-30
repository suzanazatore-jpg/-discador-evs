// Reproduce the reported failure paths on the original, immutable commit.
// No network, Twilio or Google operation is performed.
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = execFileSync('git', ['show', '773571eccdd110a9d0d21552ec8b476b7aacccdd:app/page.jsx'], { encoding: 'utf8' });
function harness() {
  const states = [], refs = [], events = {}, timers = new Map(), requests = [];
  let si = 0, ri = 0, timer = 0;
  const call = { parameters: { CallSid: 'CA-test' }, on: (event, fn) => { events[event] = fn; } };
  const ctx = vm.createContext({
    console, Date, JSON, Number, String, Boolean, Math,
    navigator: {}, window: {},
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; },
    setTimeout: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id),
    clearInterval: () => {}, setInterval: () => 0,
    useState: value => { const i = si++; if (!(i in states)) states[i] = value; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef: value => refs[ri++] ||= { current: value }, useEffect: () => {}, useMemo: fn => fn(),
  });
  let code = source.replace(/import React[^;]+;/, '').replace('export default function', 'function');
  code = code.slice(0, code.indexOf('  return (\n    <div className="app-shell">')) + 'return { chamarLead, registrar, deviceRef, autoAtivoRef, autoPausadoRef }; } globalThis.render = DiscadorEVS;';
  vm.runInContext(code, ctx);
  const render = () => { si = ri = 0; return ctx.render(); };
  const A = { id: 'A', idLead: 'A', nome: 'Teste', telefone: '+5500000000000', status: 'novo', podeLigar: 'SIM', tags: [], tentativas: 0 };
  const B = { ...A, id: 'B' }, C = { ...A, id: 'C' };
  render(); states[0] = [A, B, C]; states[6] = true;
  const api = render(); api.deviceRef.current = { connect: async () => call };
  api.autoAtivoRef.current = true; api.autoPausadoRef.current = false;
  return { api, render, states, events, requests, timers, A, B };
}
(async () => {
  let h = harness(); await h.api.chamarLead(h.A);
  h.events.accept({ parameters: { CallSid: 'CA-test' } }); h.events.disconnect();
  assert.equal(h.states[3], 'wrapup'); assert.equal(h.requests.length, 0); assert.equal(h.timers.size, 0);
  console.log('REPRODUCED: accept + disconnect leaves automatic active with no next call or result confirmation.');
  h = harness(); await h.api.chamarLead(h.A); h.events.disconnect(); await new Promise(setImmediate);
  assert.equal(h.states[3], 'idle'); h.events.cancel(); assert.equal(h.states[3], 'wrapup');
  console.log('REPRODUCED: a late terminal event overwrites the state after the result was saved.');
  h = harness(); await h.api.registrar('nao_atendeu', h.A); h.api = h.render(); await h.api.registrar('nao_atendeu', h.B);
  assert.equal(h.states[1], 'A');
  console.log('REPRODUCED: queue returns from B to A while C has never been attempted.');
})().catch(error => { console.error(error); process.exitCode = 1; });
