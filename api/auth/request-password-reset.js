import { getSupabaseServerAuthClient } from "../_lib/supabase.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "../_lib/http.js";

function parseEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function getRequestOrigin(req) {
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").trim();
  if (!host) return null;

  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").trim().toLowerCase();
  const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : "https";
  return `${protocol}://${host}`;
}

async function handlePost(req, res) {
  const body = (await getJsonBody(req)) ?? {};
  const email = parseEmail(body.email);
  if (!email) {
    throw new HttpError("Valid email is required.", 400);
  }

  const origin = getRequestOrigin(req);
  if (!origin) {
    throw new HttpError("Unable to resolve request origin.", 500);
  }

  const authClient = getSupabaseServerAuthClient();
  const redirectTo = `${origin}/reset-password`;
  const { error } = await authClient.auth.resetPasswordForEmail(email, {
    redirectTo
  });

  if (error) {
    // Keep message generic to avoid leaking account status.
    throw new HttpError("Unable to send reset email at the moment.", 500);
  }

  sendJson(res, 200, { ok: true });
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
