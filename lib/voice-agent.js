import crypto from 'crypto';

const STATUS_BLOQUEADOS = new Set([
  'agendado',
  'agendou',
  'descartado',
  'limite_de_tentativas',
  'nao_ligar',
  'vendido',
]);

function normalizarTexto(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
}

function lista(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || '')
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function telefoneE164(value) {
  const raw = String(value || '').trim();
  let digits = raw.replace(/\D/g, '');

  if (!digits) return '';
  if (!digits.startsWith('55')) digits = `55${digits}`;

  return digits.length >= 12 && digits.length <= 13 ? `+${digits}` : '';
}

export function avaliarPermissaoAgente(lead) {
  if (!lead) return { permitido: false, motivo: 'Lead não encontrado.' };

  const podeLigar = normalizarTexto(lead.pode_ligar ?? lead.podeLigar ?? lead.Pode_Ligar);
  if (!['sim', 's', 'true', '1'].includes(podeLigar)) {
    return { permitido: false, motivo: 'Pode_Ligar não está como SIM.' };
  }

  const status = normalizarTexto(lead.status ?? lead.Status);
  if (STATUS_BLOQUEADOS.has(status)) {
    return { permitido: false, motivo: `Status bloqueado: ${status}.` };
  }

  const campos = [
    ...lista(lead.tags),
    ...lista(lead.tags_pabbly ?? lead.tagsPabbly ?? lead.Tags_Pabbly),
    lead.etiqueta ?? lead.Etiqueta,
    lead.produto ?? lead.Produto,
    lead.resultado ?? lead.Resultado,
    lead.motivo_bloqueio ?? lead.motivoBloqueio ?? lead.Motivo_Bloqueio,
  ]
    .map(normalizarTexto)
    .filter(Boolean);

  const bloqueios = [
    'agendou_mentoria_meet',
    'diagnostico_agendado',
    'mentoria_impulso',
    'nao_deseja_contato',
    'nao_ligar',
    'vendido',
  ];

  const encontrado = bloqueios.find((bloqueio) =>
    campos.some((campo) => campo.includes(bloqueio))
  );
  if (encontrado) {
    return { permitido: false, motivo: `Bloqueio encontrado: ${encontrado}.` };
  }

  if (lead.data_agendamento || lead.dataAgendamento || lead.Data_Agendamento) {
    return { permitido: false, motivo: 'O lead já possui data de agendamento.' };
  }

  const telefone = telefoneE164(lead.telefone ?? lead.whatsapp ?? lead.WhatsApp);
  if (!telefone) return { permitido: false, motivo: 'Telefone inválido.' };

  return { permitido: true, telefone };
}

export function voiceAgentConfigured() {
  return Boolean(process.env.AGENTE_VOZ_API_URL && process.env.AGENTE_VOZ_SECRET);
}

export function bearerValido(request) {
  const expected = Buffer.from(process.env.AGENTE_VOZ_SECRET || '');
  const received = Buffer.from(
    String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  );

  return Boolean(
    expected.length &&
      expected.length === received.length &&
      crypto.timingSafeEqual(expected, received)
  );
}

export function resultadoCompativelBaseGeral(resultado) {
  const mapa = {
    agendado: 'reuniao',
    agendamento_pendente: 'retornar',
    retornar: 'retornar',
    interessado: 'interessado',
    sem_interesse: 'sem_interesse',
    nao_deseja_contato: 'sem_interesse',
    fora_do_perfil: 'sem_interesse',
    ja_agendado: 'reuniao',
    numero_de_outra_pessoa: 'numero_errado',
    numero_invalido: 'numero_errado',
    sem_resposta: 'nao_atendeu',
    caixa_postal: 'caixa',
    ligacao_caiu: 'caiu',
    audio_ruim: 'retornar',
    solicitou_whatsapp: 'interessado',
    duvida_para_equipe: 'interessado',
  };

  return mapa[normalizarTexto(resultado)] || '';
}

