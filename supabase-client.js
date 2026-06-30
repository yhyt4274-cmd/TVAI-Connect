// Initialize Supabase Client
const isSupabaseConfigured = typeof window.supabase !== 'undefined';

export const supabase = isSupabaseConfigured ? window.supabase : null;

if (!supabase) {
    console.warn("Supabase is not loaded. Running in local mock mode.");
}