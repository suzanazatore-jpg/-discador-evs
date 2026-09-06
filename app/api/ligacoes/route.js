import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Registra o resultado de uma ligacao e atualiza o status do lead.
export async function POST(request) {
  try {
    const body = await request.json();
    const { lead_id, resultado, duracao_seg, nota, twilio_sid } = body;

    if (!lead_id || !resultado) {
      return Response.json(
        { error: 'lead_id e resultado são obrigatórios.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1) grava a ligacao no historico
    const { error: e1 } = await supabaseAdmin.from('ligacoes').insert({
      lead_id,
      resultado,
      duracao_seg: duracao_seg || 0,
      nota: nota || null,
      twilio_sid: twilio_sid || null,
    });
    if (e1) throw new Error(`Falha ao registrar a ligação: ${e1.message}`);

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
    if (e2) throw new Error(`Falha ao atualizar o lead: ${e2.message}`);

    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Erro na rota /api/ligacoes:', error);
    return Response.json(
      { error: 'Não foi possível salvar o resultado da ligação.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
