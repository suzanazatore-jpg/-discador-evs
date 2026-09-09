import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/auth';

const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/session',
  // O Twilio chama esta rota no servidor, sem o cookie do navegador. A rota
  // valida a assinatura do Twilio antes de devolver qualquer instrução.
  '/api/voice',
]);

function withSecurityHeaders(response) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'microphone=(self)');
  return response;
}

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;

  if (PUBLIC_PATHS.has(pathname)) {
    return withSecurityHeaders(NextResponse.next());
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);

  if (pathname === '/login') {
    return withSecurityHeaders(session
      ? NextResponse.redirect(new URL('/', request.url))
      : NextResponse.next());
  }

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return withSecurityHeaders(NextResponse.json(
        { error: 'Acesso não autenticado.' },
        { status: 401 }
      ));
    }

    return withSecurityHeaders(NextResponse.redirect(new URL('/login', request.url)));
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
