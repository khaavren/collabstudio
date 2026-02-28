import { HttpError, allowMethod, getJsonBody, sendJson } from "../_lib/http.js";
import { getSupabaseAdminClient } from "../_lib/supabase.js";

const MAX_AVATAR_URL_LENGTH = 2048;

function parseAccessToken(value) {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (!token) return null;
  if (token.includes("\n") || token.includes("\r")) return null;
  return token.split(".").length === 3 ? token : null;
}

function decodeTokenPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
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

async function handlePost(req, res) {
  const body = (await getJsonBody(req)) ?? {};
  const accessToken = parseAccessToken(body.accessToken);

  if (!accessToken) {
    throw new HttpError("Valid accessToken is required.", 400);
  }

  const payload = decodeTokenPayload(accessToken);
  const userId = typeof payload?.sub === "string" ? payload.sub : null;
  if (!userId) {
    throw new HttpError("Invalid access token.", 401);
  }

  const adminClient = getSupabaseAdminClient();
  const { data: userRecord, error: userLookupError } = await adminClient.auth.admin.getUserById(userId);
  if (userLookupError || !userRecord?.user) {
    throw new HttpError("Invalid access token.", 401);
  }

  const { repaired, userMetadata } = sanitizeMetadata(userRecord.user.user_metadata);
  if (!repaired) {
    sendJson(res, 200, { ok: true, repaired: false });
    return;
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    user_metadata: userMetadata
  });
  if (updateError) {
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
