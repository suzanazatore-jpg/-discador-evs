import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Puxa a fila de leads pra ligar (view v_fila).
export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('v_fila')
      .select('*')
      .limit(100);

    if (error) {
      console.error('Erro ao carregar a fila do Supabase:', error);
      return Response.json(
        { error: 'Não foi possível carregar a fila de leads.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return Response.json(
      { leads: data || [] },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Erro inesperado na rota /api/fila:', error);
    return Response.json(
      { error: 'A conexão com o banco de dados não está configurada.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
