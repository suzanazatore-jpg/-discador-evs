function getEndpoint() {
  return process.env.BASE_GERAL_APPS_SCRIPT_URL || '';
}

function getToken() {
  return process.env.BASE_GERAL_APPS_SCRIPT_TOKEN || '';
}

export function isBaseGeralConfigured() {
  return Boolean(getEndpoint());
}

export function baseGeralMustBeAvailable() {
  return process.env.BASE_GERAL_REQUIRED === 'true';
}

async function requestBaseGeral(action, { method = 'GET', body } = {}) {
  const url = new URL(getEndpoint());
  const token = getToken();
  url.searchParams.set('action', action);
  if (method === 'GET' && token) url.searchParams.set('token', token);

  const response = await fetch(url, {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-Discador-Token': token } : {}),
    },
    ...(method === 'POST'
      ? { body: JSON.stringify({ ...(body || {}), action, token }) }
      : {}),
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (_) {
    throw new Error('O Apps Script da Base_Geral não devolveu JSON válido.');
  }

  if (!response.ok || payload.error || payload.success === false) {
    throw new Error(payload.message || payload.error || `Apps Script respondeu HTTP ${response.status}.`);
  }

  return payload;
}

export async function listarLeadsBaseGeral() {
  const payload = await requestBaseGeral('discador_fila');
  if (!Array.isArray(payload.leads)) {
    throw new Error('O Apps Script ainda não expõe a ação discador_fila.');
  }
  return payload.leads;
}

export async function listarHistoricoBaseGeral() {
  const payload = await requestBaseGeral('discador_historico');
  const historico = payload.ligacoes || payload.items || payload.history;
  if (!Array.isArray(historico)) {
    throw new Error('O Apps Script ainda não expõe a ação discador_historico.');
  }
  return historico;
}

export async function registrarLigacaoBaseGeral(payload) {
  return requestBaseGeral('discador_registrar_ligacao', {
    method: 'POST',
    body: payload,
  });
}
