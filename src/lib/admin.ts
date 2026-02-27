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

const MAX_AUTH_HEADER_TOKEN_LENGTH = 6000;

function normalizeAccessToken(value: unknown) {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return token.length > 0 ? token : null;
}

function isSafeBearerToken(token: string) {
  if (token.includes("\n") || token.includes("\r")) return false;
  return token.split(".").length === 3;
}

function canSendTokenInHeader(token: string) {
  return token.length <= MAX_AUTH_HEADER_TOKEN_LENGTH;
}

async function repairOversizedSessionToken(token: string) {
  try {
    const response = await fetch("/api/auth/repair-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ accessToken: token })
    });

    if (!response.ok) return false;
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; repaired?: boolean };
    return Boolean(payload.ok);
  } catch {
    return false;
  }
}

async function getAccessToken(options?: { forceRefresh?: boolean }) {
  const shouldForceRefresh = options?.forceRefresh === true;

  if (shouldForceRefresh) {
    await supabase.auth.refreshSession();
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }

  const token = normalizeAccessToken(data.session?.access_token ?? null);
  if (token && isSafeBearerToken(token)) {
    if (canSendTokenInHeader(token)) return token;
    await repairOversizedSessionToken(token);
  }

  // Recover from stale/corrupted local auth state without making a broken API request.
  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) return null;

  const refreshedToken = normalizeAccessToken(refreshData.session?.access_token ?? null);
  if (!refreshedToken || !isSafeBearerToken(refreshedToken)) return null;
  if (canSendTokenInHeader(refreshedToken)) return refreshedToken;

  const repaired = await repairOversizedSessionToken(refreshedToken);
  if (!repaired) return null;

  const { data: finalRefresh, error: finalRefreshError } = await supabase.auth.refreshSession();
  if (finalRefreshError) return null;

  const finalToken = normalizeAccessToken(finalRefresh.session?.access_token ?? null);
  if (!finalToken || !isSafeBearerToken(finalToken)) return null;
  return canSendTokenInHeader(finalToken) ? finalToken : null;
}

export async function fetchWithAuth(input: string, init?: RequestInit, options?: { forceRefresh?: boolean }) {
  const token = await getAccessToken(options);
  if (!token) {
    throw new Error("Authentication token unavailable. Please sign in again.");
  }
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
