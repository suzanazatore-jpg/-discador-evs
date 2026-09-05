import { supabaseAdmin } from '@/lib/supabase';

// Registra o resultado de uma ligacao e atualiza o status do lead.
export async function POST(request) {
  const body = await request.json();
  const { lead_id, resultado, duracao_seg, nota, twilio_sid } = body;

  // 1) grava a ligacao no historico
  const { error: e1 } = await supabaseAdmin.from('ligacoes').insert({
    lead_id,
    resultado,
    duracao_seg: duracao_seg || 0,
    nota: nota || null,
    twilio_sid: twilio_sid || null,
  });
  if (e1) return Response.json({ error: e1.message }, { status: 500 });

  // 2) traduz o resultado da ligacao no novo status do lead
  const mapa = {
    reuniao: 'reuniao',
    interessado: 'retornar',
    retornar: 'retornar',
    nao_atendeu: 'novo',
    numero_errado: 'descartado',
    sem_interesse: 'descartado',
    caiu: 'novo',
  };
  const novoStatus = mapa[resultado] || 'contatado';

  const { error: e2 } = await supabaseAdmin
    .from('leads')
    .update({ status: novoStatus })
    .eq('id', lead_id);
  if (e2) return Response.json({ error: e2.message }, { status: 500 });

  return Response.json({ ok: true });
}
