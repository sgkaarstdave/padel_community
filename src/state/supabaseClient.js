const SUPABASE_URL = 'https://gutesbsaqkkusbuukdyg.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1dGVzYnNhcWtrdXNidXVrZHlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0NDY1NDMsImV4cCI6MjA3OTAyMjU0M30.gkjdKY9694s7-otyd4ax_yB23G3usWLEVfMZ-dr50wo';

let cachedClient = null;

const createSupabaseClient = () => {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseFactory = globalThis?.supabase?.createClient;

  if (typeof supabaseFactory !== 'function') {
    throw new Error(
      'Supabase Client ist nicht verfügbar. Stelle sicher, dass das Skript geladen ist.'
    );
  }

  cachedClient = supabaseFactory(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return cachedClient;
};

export { createSupabaseClient };
