import { createHash } from "node:crypto";
import { decryptSecret } from "./_lib/encryption.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "./_lib/http.js";
import { getSupabaseAdminClient } from "./_lib/supabase.js";
import { resolveMembership } from "./_lib/auth.js";

function normalizedSize(size) {
  if (typeof size !== "string") return "1024x1024";
  return /^\d+x\d+$/.test(size) ? size : "1024x1024";
}

async function incrementUsage(organizationId) {
  const adminClient = getSupabaseAdminClient();
  const month = new Date().toISOString().slice(0, 7);

  const { data: current, error: lookupError } = await adminClient
    .from("usage_metrics")
    .select("id, images_generated, api_calls")
    .eq("organization_id", organizationId)
    .eq("month", month)
    .maybeSingle();

  if (lookupError) return;

  if (!current) {
    await adminClient.from("usage_metrics").insert({
      organization_id: organizationId,
      month,
      images_generated: 1,
      api_calls: 1,
      storage_used_mb: 0
    });
    return;
  }

  await adminClient
    .from("usage_metrics")
    .update({
      images_generated: Number(current.images_generated ?? 0) + 1,
      api_calls: Number(current.api_calls ?? 0) + 1
    })
    .eq("id", current.id);
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["POST"])) return;

  try {
    const body = (await getJsonBody(req)) ?? {};
    const prompt = String(body.prompt ?? "").trim();
    const size = normalizedSize(body.size);

    if (!prompt) {
      sendJson(res, 400, { error: "Prompt is required." });
      return;
    }

    const adminClient = getSupabaseAdminClient();
    const membership = await resolveMembership(req);
    let organizationId = membership?.organization_id ?? null;

    if (!organizationId) {
      const { data: firstOrg } = await adminClient
        .from("organizations")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      organizationId = firstOrg?.id ?? null;
    }

    let configured = false;
    let providerUsed = "Placeholder";
    let modelUsed = "picsum";

    if (organizationId) {
      const { data: apiSetting } = await adminClient
        .from("api_settings")
        .select("provider, model, encrypted_api_key")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (
        apiSetting?.provider &&
        apiSetting?.model &&
        apiSetting?.encrypted_api_key &&
        apiSetting.encrypted_api_key.length > 0
      ) {
        try {
          const key = decryptSecret(apiSetting.encrypted_api_key);
          if (key.length > 0) {
            configured = true;
            providerUsed = apiSetting.provider;
            modelUsed = apiSetting.model;
          }
        } catch {
          configured = false;
        }
      }
    }

    const [width, height] = size.split("x");
    const seed = createHash("sha256")
      .update(`${prompt}:${size}:${providerUsed}:${modelUsed}:band-joes-studio`)
      .digest("hex")
      .slice(0, 16);

    const imageUrl = `https://picsum.photos/seed/${seed}/${width}/${height}`;

    if (organizationId) {
      await incrementUsage(organizationId);
    }

    sendJson(res, 200, {
      imageUrl,
      configured,
      providerUsed,
      modelUsed
    });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    sendJson(res, 500, { error: "Unexpected server error." });
  }
}
