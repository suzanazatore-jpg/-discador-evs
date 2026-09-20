import { listarLeadsBaseGeral } from '@/lib/base-geral';
import { normalizarIdLead } from '@/lib/lead-id';
import { avaliarPermissaoAgente, voiceAgentConfigured } from '@/lib/voice-agent';

function leadId(lead) {
  return normalizarIdLead(lead?.id_lead || lead?.id || '');
}

export async function iniciarLigacaoAna({ requestedId, requestedRow }) {
  const idSolicitado = normalizarIdLead(requestedId);

  if (process.env.AGENTE_VOZ_ENABLED !== 'true') {
    const error = new Error('A Ana está em modo seguro e ainda não foi liberada para ligar.');
    error.status = 503;
    throw error;
  }

  if (!voiceAgentConfigured()) {
    const error = new Error('O serviço de voz da Ana ainda não está configurado.');
    error.status = 503;
    throw error;
  }

  if (!idSolicitado && !requestedRow) {
    const error = new Error('Informe o lead que será chamado.');
    error.status = 400;
    throw error;
  }

  // A permissão sempre é conferida novamente na fonte. Nunca confiamos apenas
  // no lead que chegou do navegador ou do Pabbly.
  const leads = await listarLeadsBaseGeral();
  const lead = leads.find((item) =>
    (idSolicitado && leadId(item) === idSolicitado) ||
    (requestedRow && Number(item.sheet_row) === Number(requestedRow))
  );

  const permissao = avaliarPermissaoAgente(lead);
  if (!permissao.permitido) {
    const error = new Error(permissao.motivo);
    error.status = 409;
    throw error;
  }

  const endpoint = new URL('/calls', process.env.AGENTE_VOZ_API_URL).toString();
  const response = await fetch(endpoint, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.AGENTE_VOZ_SECRET}`,
    },
    body: JSON.stringify({
      lead: {
        ...lead,
        id: leadId(lead) || `sheet-row-${lead.sheet_row}`,
        telefone: permissao.telefone,
      },
    }),
  });

  const responseText = await response.text();
  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const upstreamMessage = String(
      payload.detail || payload.error || payload.message || responseText || ''
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);
    const message = upstreamMessage
      ? `Serviço de voz respondeu HTTP ${response.status}: ${upstreamMessage}`
      : `Serviço de voz respondeu HTTP ${response.status} sem detalhes.`;

    console.error('Falha ao iniciar chamada no serviço de voz:', {
      status: response.status,
      mensagem: upstreamMessage || 'sem detalhes',
    });

    const error = new Error(
      message
    );
    error.status = response.status;
    throw error;
  }

  return payload;
}
