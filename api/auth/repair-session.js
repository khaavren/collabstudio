import { HttpError, allowMethod, getJsonBody, sendJson } from "../_lib/http.js";

const MAX_AVATAR_URL_LENGTH = 2048;

function parseAccessToken(value) {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (!token) return null;
  if (token.includes("\n") || token.includes("\r")) return null;
  return token.split(".").length === 3 ? token : null;
}

function parseSupabaseUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    if (!parsed.hostname.endsWith(".supabase.co")) return null;
    return `${parsed.origin}`;
  } catch {
    return null;
  }
}

function parseAnonKey(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeMetadata(metadata) {
  const next = metadata && typeof metadata === "object" ? { ...metadata } : {};
  const avatarValue = next.avatar_url;
  const avatarUrl = typeof avatarValue === "string" ? avatarValue : null;

  if (!avatarUrl) {
    return { repaired: false, userMetadata: next };
  }

  if (avatarUrl.startsWith("data:") || avatarUrl.length > MAX_AVATAR_URL_LENGTH) {
    next.avatar_url = null;
    return { repaired: true, userMetadata: next };
  }

  return { repaired: false, userMetadata: next };
}

async function fetchAuthUser(supabaseUrl, anonKey, accessToken) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey
    }
  });

  if (!response.ok) {
    return { user: null, status: response.status };
  }

  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return { user: null, status: 500 };
  }

  return { user: payload, status: 200 };
}

async function updateAuthUserMetadata(supabaseUrl, anonKey, accessToken, userMetadata) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      data: userMetadata
    })
  });

  return response.ok;
}

async function handlePost(req, res) {
  const body = (await getJsonBody(req)) ?? {};
  const accessToken = parseAccessToken(body.accessToken);
  const supabaseUrl = parseSupabaseUrl(body.supabaseUrl);
  const supabaseAnonKey = parseAnonKey(body.supabaseAnonKey);

  if (!accessToken) {
    throw new HttpError("Valid accessToken is required.", 400);
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new HttpError("Valid supabaseUrl and supabaseAnonKey are required.", 400);
  }

  const authUserResult = await fetchAuthUser(supabaseUrl, supabaseAnonKey, accessToken);
  if (!authUserResult.user) {
    throw new HttpError("Invalid access token.", 401);
  }

  const { repaired, userMetadata } = sanitizeMetadata(authUserResult.user.user_metadata);
  if (!repaired) {
    sendJson(res, 200, { ok: true, repaired: false });
    return;
  }

  const updated = await updateAuthUserMetadata(supabaseUrl, supabaseAnonKey, accessToken, userMetadata);
  if (!updated) {
    throw new HttpError("Unable to repair session metadata.", 500);
  }

  sendJson(res, 200, { ok: true, repaired: true });
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["POST"])) return;

  try {
    await handlePost(req, res);
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    sendJson(res, 500, { error: "Unexpected server error." });
  }
}
