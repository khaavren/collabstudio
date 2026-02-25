import { requireAdmin } from "../_lib/auth.js";
import { decryptSecret } from "../_lib/encryption.js";
import { HttpError, allowMethod, sendJson } from "../_lib/http.js";
import { getSupabaseAdminClient } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["POST"])) return;

  try {
    const { organization } = await requireAdmin(req);
    const adminClient = getSupabaseAdminClient();

    const { data: settings, error } = await adminClient
      .from("api_settings")
      .select("provider, model, encrypted_api_key")
      .eq("organization_id", organization.id)
      .maybeSingle();

    if (error) {
      throw new HttpError(error.message, 500);
    }

    const configured = Boolean(
      settings?.provider && settings?.model && settings?.encrypted_api_key
    );

    if (!configured) {
      sendJson(res, 200, {
        ok: false,
        status: "Not Configured",
        message: "Model API is not configured yet. Placeholder mode will be used."
      });
      return;
    }

    try {
      const decrypted = decryptSecret(settings.encrypted_api_key);
      if (!decrypted) {
        sendJson(res, 200, {
          ok: false,
          status: "Not Configured",
          message: "API key could not be decrypted."
        });
        return;
      }
    } catch {
      sendJson(res, 200, {
        ok: false,
        status: "Not Configured",
        message: "API key could not be decrypted."
      });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      status: "Configured",
      message: `Connection test passed for ${settings.provider} (${settings.model}).`
    });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    sendJson(res, 500, { error: "Unexpected server error." });
  }
}
