import crypto from 'crypto';
import { normalizarIdLead } from '@/lib/lead-id';
import { iniciarLigacaoAna } from '@/lib/voice-agent-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function webhookAutorizado(request) {
  const expected = Buffer.from(process.env.AGENTE_VOZ_WEBHOOK_SECRET || '');
  const received = Buffer.from(
    String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  );
  return Boolean(
    expected.length &&
      expected.length === received.length &&
      crypto.timingSafeEqual(expected, received)
  );
}

// O Pabbly chama esta rota logo depois de gravar o lead selecionado na Base Geral.
// O payload traz apenas o ID_Lead ou a linha; os dados e bloqueios são relidos da planilha.
export async function POST(request) {
  try {
    if (!webhookAutorizado(request)) {
      return Response.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    const payload = await iniciarLigacaoAna({
      requestedId: normalizarIdLead(body.lead_id || body.id_lead || body.ID_Lead),
      requestedRow: Number(body.sheet_row || body.linha || 0),
    });

    return Response.json({ ok: true, ...payload }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Erro no webhook automático da Ana:', error);
    return Response.json(
      { error: error.message || 'Não foi possível iniciar a ligação da Ana.' },
      { status: Number(error.status) || 500 }
    );
  }
}
