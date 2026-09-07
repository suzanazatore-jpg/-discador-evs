import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Retorna o histórico para a aba Histórico do painel.
export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('ligacoes')
      .select('*')
      .limit(500);

    if (error) throw new Error(error.message);

    return Response.json(
      { ligacoes: data || [] },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Erro ao carregar histórico de ligações:', error);
    return Response.json(
      { error: 'Não foi possível carregar o histórico de ligações.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

// Registra o resultado de uma ligacao e atualiza o status do lead.
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      lead_id,
      resultado,
      duracao_seg,
      nota,
      twilio_sid,
      proxima_acao,
      data_retorno,
      data_agendamento,
      tentativa,
    } = body;

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
      nao_atendeu: 'retornar',
      caixa: 'retornar',
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

    const kabam = nota
      ? {
          evento: 'discador.comentario',
          versao: 1,
          status: 'pendente',
          sincronizado: false,
          id_evento: twilio_sid || `${lead_id}-${Date.now()}`,
          id_lead: lead_id,
          comentario: nota,
          resultado,
          duracao_segundos: duracao_seg || 0,
          data_hora: new Date().toISOString(),
          proxima_acao: proxima_acao || '',
          data_retorno: data_retorno || '',
          data_agendamento: data_agendamento || '',
          tentativa: tentativa || 0,
          origem: 'Discador EVS',
          destino: 'Kabam / BotConversa',
        }
      : null;

    return Response.json(
      { ok: true, kabam },
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
