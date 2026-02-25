import { requireAdmin } from "../_lib/auth.js";
import { decryptSecret } from "../_lib/encryption.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "../_lib/http.js";
import { defaultModelForProvider, discoverModels, normalizeProvider } from "../_lib/providers.js";
import { getSupabaseAdminClient } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["POST"])) return;

  try {
    const { organization } = await requireAdmin(req);
    const adminClient = getSupabaseAdminClient();
    const body = (await getJsonBody(req)) ?? {};

    const { data: settings, error } = await adminClient
      .from("api_settings")
      .select("provider, model, encrypted_api_key")
      .eq("organization_id", organization.id)
      .maybeSingle();

    if (error) {
      throw new HttpError(error.message, 500);
    }

    const provider = normalizeProvider(body.provider || settings?.provider || "");
    const requestedModel = String(body.model ?? "").trim();
    const providedApiKey = String(body.apiKey ?? "").trim();
    let resolvedApiKey = providedApiKey;

    if (!resolvedApiKey && settings?.encrypted_api_key) {
      try {
        resolvedApiKey = decryptSecret(settings.encrypted_api_key);
      } catch {
        resolvedApiKey = "";
      }
    }

    if (!provider || !resolvedApiKey) {
      sendJson(res, 200, {
        ok: false,
        status: "Not Configured",
        message: "Provider and API key are required. Placeholder mode will be used.",
        provider,
        model: settings?.model ?? "",
        models: []
      });
      return;
    }

    try {
      const discovery = await discoverModels(provider, resolvedApiKey);
      const discoveredModels = discovery.models ?? [];
      const resolvedModel =
        requestedModel || settings?.model || discoveredModels[0] || defaultModelForProvider(provider);

      sendJson(res, 200, {
        ok: discovery.ok,
        status: discovery.ok ? "Configured" : "Not Configured",
        message:
          discovery.message ||
          `Connection test passed for ${provider}${resolvedModel ? ` (${resolvedModel})` : ""}.`,
        provider,
        model: resolvedModel,
        models: discoveredModels
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Connection test failed.";
      sendJson(res, 200, {
        ok: false,
        status: "Not Configured",
        message,
        provider,
        model: settings?.model || defaultModelForProvider(provider),
        models: []
      });
    }
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    sendJson(res, 500, { error: "Unexpected server error." });
  }
}
