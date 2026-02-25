import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl, requiredEnv } from "./env.js";

let adminClient = null;
let authClient = null;

export function getSupabaseAdminClient() {
  if (!adminClient) {
    const url = getSupabaseUrl() || requiredEnv("VITE_SUPABASE_URL");
    const serviceRole = getSupabaseServiceRoleKey() || requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    adminClient = createClient(url, serviceRole, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return adminClient;
}

export function getSupabaseServerAuthClient() {
  if (!authClient) {
    const url = getSupabaseUrl() || requiredEnv("VITE_SUPABASE_URL");
    const anonKey = getSupabaseAnonKey() || requiredEnv("VITE_SUPABASE_ANON_KEY");

    authClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return authClient;
}
