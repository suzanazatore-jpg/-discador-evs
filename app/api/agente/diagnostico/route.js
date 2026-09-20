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

async function diagnosticarServicoVoz() {
  if (!process.env.AGENTE_VOZ_API_URL) {
    return { online: false, erro: 'AGENTE_VOZ_API_URL não configurada.' };
  }

  try {
    const endpoint = new URL('/health', process.env.AGENTE_VOZ_API_URL).toString();
    const response = await fetch(endpoint, { cache: 'no-store' });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }

    return {
      online: response.ok,
      status_http: response.status,
      agente_habilitada: payload.enabled ?? null,
      modo: payload.mode ?? null,
      calendly_configurado: payload.calendly_configured ?? null,
    };
  } catch (error) {
    return {
      online: false,
      erro: String(error?.message || error || 'Falha ao consultar o serviço de voz')
        .replace(/\s+/g, ' ')
        .slice(0, 300),
    };
  }
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

    const servicoVoz = await diagnosticarServicoVoz();

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
        servico_voz: servicoVoz,
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
