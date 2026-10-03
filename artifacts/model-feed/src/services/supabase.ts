import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

function configurationProblem(): string | null {
  if (!supabaseUrl || !publishableKey) {
    return "Supabase is not configured. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or the VITE_-prefixed local aliases) to the build environment, then restart the app.";
  }

  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      return "VITE_SUPABASE_URL must use HTTPS (except for localhost development).";
    }
  } catch {
    return "VITE_SUPABASE_URL is not a valid URL.";
  }

  return null;
}

export const supabaseConfigError = configurationProblem();
export const isSupabaseConfigured = supabaseConfigError === null;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (supabaseConfigError) throw new Error(supabaseConfigError);
  if (!client) {
    client = createClient(supabaseUrl!, publishableKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export async function getSessionAccessToken(): Promise<string | null> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw new Error(`Could not verify your sign-in: ${error.message}`);
  return data.session?.access_token ?? null;
}