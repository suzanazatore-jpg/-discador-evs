import { iniciarLigacaoAna } from '@/lib/voice-agent-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedId = String(body.lead_id || body.id_lead || '');
    const requestedRow = Number(body.sheet_row || 0);
    const payload = await iniciarLigacaoAna({ requestedId, requestedRow });

    return Response.json({ ok: true, ...payload }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Erro ao iniciar ligação da Ana:', error);
    return Response.json(
      { error: error.message || 'Não foi possível iniciar a ligação da Ana.' },
      { status: Number(error.status) || 500 }
    );
  }
}

