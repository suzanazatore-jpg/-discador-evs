import crypto from 'crypto';
import { listarLeadsBaseGeral } from '@/lib/base-geral';
import { normalizarIdLead } from '@/lib/lead-id';

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

// Diagnostica a leitura da Base_Geral sem iniciar ligação.
export async function POST(request) {
  try {
    if (!webhookAutorizado(request)) {
      return Response.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    const requestedId = normalizarIdLead(body.lead_id || body.id_lead || body.ID_Lead);
    const requestedRow = Number(body.sheet_row || body.linha || 0);
    const leads = await listarLeadsBaseGeral();
    const lead = leads.find((item) => {
      const itemId = normalizarIdLead(item?.id_lead || item?.id);
      return (
        (requestedId && itemId === requestedId) ||
        (requestedRow && Number(item?.sheet_row) === requestedRow)
      );
    });

    return Response.json(
      {
        ok: true,
        chamada_iniciada: false,
        id_recebido: requestedId,
        linha_recebida: requestedRow || null,
        total_leads: leads.length,
        lead_encontrado: Boolean(lead),
        id_encontrado: lead ? normalizarIdLead(lead.id_lead || lead.id) : null,
        linha_encontrada: lead?.sheet_row || null,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Erro no diagnóstico automático da Ana:', error);
    return Response.json(
      { error: error.message || 'Não foi possível diagnosticar a Base_Geral.' },
      { status: Number(error.status) || 500 }
    );
  }
}
