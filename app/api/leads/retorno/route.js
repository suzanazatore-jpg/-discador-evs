import { alterarRetornoBaseGeral, isBaseGeralConfigured } from '@/lib/base-geral';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body.lead_id || (!body.id_lead && !body.telefone) || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.data_retorno || ''))) {
      return Response.json({ error: 'Informe o contato e a data do retorno.' }, { status: 400 });
    }
    if (!isBaseGeralConfigured()) return Response.json({ error: 'Base_Geral não configurada.' }, { status: 503 });
    const result = await alterarRetornoBaseGeral({lead_id: body.lead_id, id_lead: body.id_lead || body.lead_id,
      sheet_row: body.sheet_row, telefone: body.telefone, data_retorno: body.data_retorno});
    if (!result.ok || !result.lead) throw new Error('A base não confirmou o retorno.');
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({error: error.message || 'Não foi possível salvar o retorno.'},
      {status: 502, headers: {'Cache-Control': 'no-store'}});
  }
}
