import { bloquearLeadBaseGeral, isBaseGeralConfigured } from '@/lib/base-geral';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body.lead_id || (!body.id_lead && !body.telefone)) {
      return Response.json({ error: 'Identificação do contato ausente.' }, { status: 400 });
    }
    if (!isBaseGeralConfigured()) {
      return Response.json({ error: 'Base_Geral não configurada. Nenhum contato foi retirado.' }, { status: 503 });
    }
    const result = await bloquearLeadBaseGeral({
      lead_id: body.lead_id, id_lead: body.id_lead || body.lead_id,
      sheet_row: body.sheet_row, telefone: body.telefone,
    });
    if (!result.ok || !result.lead) throw new Error('A base não confirmou o bloqueio.');
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'Não foi possível retirar o contato.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
