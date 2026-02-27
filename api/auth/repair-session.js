import { HttpError, allowMethod, getJsonBody, sendJson } from "../_lib/http.js";
import { getSupabaseAdminClient, getSupabaseServerAuthClient } from "../_lib/supabase.js";

const MAX_AVATAR_URL_LENGTH = 2048;

function parseAccessToken(value) {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (!token) return null;
  if (token.includes("\n") || token.includes("\r")) return null;
  return token.split(".").length === 3 ? token : null;
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

  const authClient = getSupabaseServerAuthClient();
  const primaryResult = await authClient.auth.getUser(accessToken);
  const userFromPrimary = primaryResult.error ? null : primaryResult.data.user;

  let resolvedUser = userFromPrimary;
  if (!resolvedUser) {
    const adminClient = getSupabaseAdminClient();
    const fallbackResult = await adminClient.auth.getUser(accessToken);
    resolvedUser = fallbackResult.error ? null : fallbackResult.data.user;
  }

  if (!resolvedUser) {
    throw new HttpError("Invalid access token.", 401);
  }

  const { repaired, userMetadata } = sanitizeMetadata(resolvedUser.user_metadata);
  if (!repaired) {
    sendJson(res, 200, { ok: true, repaired: false });
    return;
  }

  const adminClient = getSupabaseAdminClient();
  const { error: updateError } = await adminClient.auth.admin.updateUserById(resolvedUser.id, {
    user_metadata: userMetadata
  });
  if (updateError) {
    throw new HttpError(updateError.message, 500);
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
