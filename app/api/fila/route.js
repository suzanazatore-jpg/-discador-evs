import { getSupabaseAdmin } from '@/lib/supabase';
import {
  baseGeralMustBeAvailable,
  isBaseGeralConfigured,
  listarLeadsBaseGeral,
} from '@/lib/base-geral';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Puxa a fila de leads pra ligar (view v_fila).
export async function GET() {
  try {
    let baseGeralFallback = false;

    if (isBaseGeralConfigured()) {
      try {
        const leads = await listarLeadsBaseGeral();
        return Response.json(
          { leads, source: 'Base_Geral' },
          { headers: { 'Cache-Control': 'no-store', 'X-Discador-Source': 'Base_Geral' } }
        );
      } catch (sheetsError) {
        // A leitura da fila pode continuar pelo espelho no Supabase. O modo
        // estrito permanece valendo para escritas em /api/ligacoes, evitando
        // registrar um resultado somente em uma das bases.
        baseGeralFallback = true;
        console.warn('Base_Geral indisponível; lendo fila do fallback Supabase:', sheetsError);
      }
    } else if (baseGeralMustBeAvailable()) {
      return Response.json(
        { error: 'BASE_GERAL_APPS_SCRIPT_URL não foi configurada.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('v_fila')
      .select('*')
      .limit(1000);

    if (error) {
      console.error('Erro ao carregar a fila do Supabase:', error);
      return Response.json(
        { error: 'Não foi possível carregar a fila de leads.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return Response.json(
      {
        leads: data || [],
        source: 'Supabase',
        ...(baseGeralFallback ? { fallback: 'Base_Geral' } : {}),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'X-Discador-Source': 'Supabase',
          ...(baseGeralFallback ? { 'X-Discador-Fallback': 'Base_Geral' } : {}),
        },
      }
    );
  } catch (error) {
    console.error('Erro inesperado na rota /api/fila:', error);
    return Response.json(
      { error: 'A conexão com o banco de dados não está configurada.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
