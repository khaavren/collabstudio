import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

let adminClient: SupabaseClient<Database> | null = null;
let serverAuthClient: SupabaseClient<Database> | null = null;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSupabaseAdminClient() {
  if (!adminClient) {
    const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRole = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    adminClient = createClient<Database>(url, serviceRole, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return adminClient;
}

export function getSupabaseServerAuthClient() {
  if (!serverAuthClient) {
    const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anon = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    serverAuthClient = createClient<Database>(url, anon, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return serverAuthClient;
}
