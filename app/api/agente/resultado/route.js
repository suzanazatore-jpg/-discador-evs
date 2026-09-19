import { registrarLigacaoBaseGeral } from '@/lib/base-geral';
import { bearerValido, resultadoCompativelBaseGeral } from '@/lib/voice-agent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    if (!bearerValido(request)) {
      return Response.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    const resultado = resultadoCompativelBaseGeral(body.resultado);
    if (!resultado) {
      return Response.json({ error: 'Resultado da Ana inválido.' }, { status: 400 });
    }

    if (!body.lead_id && !body.sheet_row) {
      return Response.json({ error: 'Identificação do lead ausente.' }, { status: 400 });
    }

    const resumo = String(body.resumo || '').trim();
    const resultadoOriginal = String(body.resultado || '').trim();
    const nota = [
      resumo,
      resultadoOriginal ? `Resultado da Ana: ${resultadoOriginal}.` : '',
      body.meet_url ? `Google Meet: ${body.meet_url}` : '',
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 4000);

    const sheetsResult = await registrarLigacaoBaseGeral({
      lead_id: body.lead_id || `sheet-row-${body.sheet_row}`,
      id_lead: body.id_lead || body.lead_id,
      sheet_row: body.sheet_row,
      nome: body.nome,
      telefone: body.telefone,
      resultado,
      duracao_seg: Number(body.duracao_seg || 0),
      nota,
      twilio_sid: body.twilio_sid,
      proxima_acao: body.proxima_acao || '',
      data_retorno: body.data_retorno || '',
      data_agendamento: body.data_agendamento || '',
      tentativa: Number(body.tentativa || 0),
    });

    return Response.json(
      { ok: true, source: 'Base_Geral', ligacao: sheetsResult.ligacao || null },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Erro ao registrar resultado da Ana:', error);
    return Response.json(
      { error: error.message || 'Não foi possível registrar o resultado da Ana.' },
      { status: 500 }
    );
  }
}

