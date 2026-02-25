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

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }

  return data.session?.access_token ?? null;
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
