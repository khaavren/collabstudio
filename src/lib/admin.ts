import { supabase } from "@/lib/supabase";

export type TeamRole = "admin" | "editor" | "viewer";

export type AdminSettingsResponse = {
  organization: {
    id: string;
    name: string;
    slug: string;
    website: string | null;
    contact_email: string | null;
    phone: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
    logo_storage_path: string | null;
    created_at: string;
    updated_at: string;
  };
  teamMembers: Array<{
    id: string;
    organization_id: string;
    user_id: string;
    role: TeamRole;
    created_at: string;
    email: string | null;
    displayName: string | null;
  }>;
  apiSettings: {
    provider: string;
    model: string;
    defaultImageSize: string;
    defaultParams: Record<string, unknown>;
    configured: boolean;
    updatedAt: string | null;
  };
  usage: {
    month: string;
    images_generated: number;
    storage_used_mb: number;
    api_calls: number;
  };
  security: {
    supabaseConnected: boolean;
    storageBucketConnected: boolean;
    modelApiConfigured: boolean;
    lastSettingsUpdate: string;
    appVersion: string;
  };
};

const MAX_BEARER_TOKEN_LENGTH = 7000;

function normalizeAccessToken(value: unknown) {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return token.length > 0 ? token : null;
}

function isSafeBearerToken(token: string) {
  if (token.length > MAX_BEARER_TOKEN_LENGTH) return false;
  if (token.includes("\n") || token.includes("\r")) return false;
  return token.split(".").length === 3;
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }

  const token = normalizeAccessToken(data.session?.access_token ?? null);
  if (token && isSafeBearerToken(token)) return token;

  // Recover from stale/corrupted local auth state without making a broken API request.
  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) return null;

  const refreshedToken = normalizeAccessToken(refreshData.session?.access_token ?? null);
  if (!refreshedToken) return null;
  return isSafeBearerToken(refreshedToken) ? refreshedToken : null;
}

export async function fetchWithAuth(input: string, init?: RequestInit) {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers ?? {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!(init?.body instanceof FormData) && init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, {
    ...init,
    headers
  });
}
