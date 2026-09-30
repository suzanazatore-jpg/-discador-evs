import twilio from 'twilio';
import { callOutcome } from '@/lib/call-outcome.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Protected by the existing session middleware. Read-only: never starts calls.
export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
  const sid = new URL(request.url).searchParams.get('sid') || '';
  if (!/^CA[0-9a-f]{32}$/i.test(sid)) return Response.json({ error: 'Identificador de chamada inválido.' }, { status: 400, headers });
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return Response.json({ error: 'A consulta de chamadas do Twilio não está configurada.' }, { status: 503, headers });
  }
  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN, { timeout: 4000, autoRetry: false });
    const parent = await client.calls(sid).fetch();
    if (parent.from !== 'client:vendedora') {
      return Response.json({ error: 'Esta chamada não pertence ao discador do navegador.' }, { status: 404, headers });
    }
    const children = await client.calls.list({ parentCallSid: sid, limit: 5 });
    return Response.json(callOutcome(parent, children), { headers });
  } catch (error) {
    console.error('Falha na consulta do estado Twilio', { code: error.code, status: error.status });
    return Response.json({ error: 'Não foi possível confirmar o estado da chamada no Twilio.' }, { status: 502, headers });
  }
}
