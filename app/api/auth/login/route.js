import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  authConfigured,
  createSessionToken,
  credentialsMatch,
} from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request) {
  let body = {};

  try {
    body = await request.json();
  } catch (_) {
    return NextResponse.json(
      { error: 'Informe usuário e senha.' },
      { status: 400 }
    );
  }

  if (!authConfigured()) {
    return NextResponse.json(
      { error: 'O login ainda não foi configurado no servidor.' },
      { status: 503 }
    );
  }

  const login = String(body.login || body.username || '').trim();
  const senha = String(body.senha || body.password || '');

  if (!credentialsMatch(login, senha)) {
    return NextResponse.json(
      { error: 'Usuário ou senha inválidos.' },
      { status: 401 }
    );
  }

  const token = await createSessionToken(login);
  const response = NextResponse.json({ ok: true });

  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}
