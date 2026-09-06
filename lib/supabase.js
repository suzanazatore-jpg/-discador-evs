import { createClient } from '@supabase/supabase-js';

// Cliente de servidor: usa a service role key.
// SO deve ser usado dentro das rotas /api (nunca no navegador).
let cachedClient;

export function getSupabaseAdmin() {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase server environment variables are not configured.');
  }

  cachedClient = createClient(url, key, {
    auth: { persistSession: false },
  });

  return cachedClient;
}
