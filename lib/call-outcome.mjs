// The SDK describes the browser leg. Only the dialed (child) leg tells us
// whether the customer's phone answered. A completed parent is not proof.
export const TERMINAL_CALL_STATUSES = new Set(['completed', 'no-answer', 'busy', 'failed', 'canceled']);

export function callOutcome(parent, children) {
  const child = children.find((item) => item.parentCallSid === parent.sid);
  const status = child?.status || '';
  return {
    status: status || (TERMINAL_CALL_STATUSES.has(parent.status) ? 'unknown' : parent.status),
    terminal: TERMINAL_CALL_STATUSES.has(status) || (!child && TERMINAL_CALL_STATUSES.has(parent.status)),
    noAnswer: status === 'no-answer' || status === 'busy',
    answered: status === 'completed' || status === 'in-progress',
    duration: Number(child?.duration || 0),
  };
}

export async function readCallOutcome(sid, { request = fetch, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), attempts = 3 } = {}) {
  if (!/^CA[0-9a-f]{32}$/i.test(sid || '')) throw new Error('Não foi possível identificar a chamada no Twilio.');
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await request(`/api/voice/status?sid=${encodeURIComponent(sid)}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (response.status === 401) throw Object.assign(new Error('Sua sessão expirou. Entre novamente antes de continuar.'), { status: 401 });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível consultar a chamada.');
      if (body.terminal && body.status !== 'unknown') return body;
      lastError = new Error('O Twilio ainda não confirmou o resultado da chamada.');
      if (attempt === attempts - 1) return body;
    } catch (error) {
      if (error.status === 401) throw error;
      lastError = error;
    }
    if (attempt < attempts - 1) await wait(750);
  }
  throw lastError;
}
