import { supabaseAdmin } from '@/lib/supabase';

// Puxa a fila de leads pra ligar (view v_fila).
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('v_fila')
    .select('*')
    .limit(100);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ leads: data || [] });
}
