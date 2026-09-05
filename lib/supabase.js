import { createClient } from '@supabase/supabase-js';

// Cliente de servidor: usa a service role key.
// SO deve ser usado dentro das rotas /api (nunca no navegador).
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
