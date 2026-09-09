export const SESSION_COOKIE = 'discador_evs_session';
export const SESSION_MAX_AGE = 60 * 60 * 8;

function authSecret() {
  return process.env.DISCADOR_AUTH_SECRET || '';
}

export function authConfigured() {
  return Boolean(
    process.env.DISCADOR_LOGIN &&
      process.env.DISCADOR_SENHA &&
      authSecret().length >= 32
  );
}

export function credentialsMatch(login, senha) {
  return (
    authConfigured() &&
    String(login || '').trim() === String(process.env.DISCADOR_LOGIN).trim() &&
    String(senha || '') === String(process.env.DISCADOR_SENHA)
  );
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeText(value) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function decodeText(value) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function importKey(usage) {
  if (!authSecret() || !globalThis.crypto?.subtle) return null;
  return globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

async function sign(value) {
  const key = await importKey('sign');
  if (!key) throw new Error('A autenticação do painel não está configurada.');
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value)
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function createSessionToken(login) {
  const payload = encodeText(
    JSON.stringify({
      sub: String(login),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
    })
  );

  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token) {
  if (!token || !authSecret() || !globalThis.crypto?.subtle) return null;

  const [payload, signature] = String(token).split('.');
  if (!payload || !signature) return null;

  try {
    const data = JSON.parse(decodeText(payload));
    if (!data.sub || Number(data.exp) <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    const key = await importKey('verify');
    const valid = await globalThis.crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(signature),
      new TextEncoder().encode(payload)
    );

    return valid ? data : null;
  } catch (_) {
    return null;
  }
}
