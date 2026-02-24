export function getPublicSupabaseEnv() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isConfigured = Boolean(rawUrl && rawAnonKey);

  const url = rawUrl ?? "https://placeholder.supabase.co";
  const anonKey = rawAnonKey ?? "placeholder-anon-key";

  return { url, anonKey, isConfigured };
}
