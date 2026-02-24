import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { RequestAuthError, requireMemberRequest } from "@/lib/server/auth";
import { decryptSecret } from "@/lib/server/encryption";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

function normalizedSize(size: unknown): string {
  if (typeof size !== "string") return "1024x1024";
  return /^\d+x\d+$/.test(size) ? size : "1024x1024";
}

async function incrementUsage(organizationId: string) {
  const adminClient = getSupabaseAdminClient();
  const month = new Date().toISOString().slice(0, 7);

  const { data: current, error: currentError } = await adminClient
    .from("usage_metrics")
    .select("id, images_generated, api_calls, storage_used_mb")
    .eq("organization_id", organizationId)
    .eq("month", month)
    .maybeSingle();

  if (currentError) return;

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
      images_generated: current.images_generated + 1,
      api_calls: current.api_calls + 1
    })
    .eq("id", current.id);
}

export async function POST(request: Request) {
  try {
    const { membership } = await requireMemberRequest(request, ["admin", "editor"]);

    const body = (await request.json().catch(() => null)) as
      | { prompt?: string; size?: string }
      | null;

    const prompt = body?.prompt?.trim();
    const size = normalizedSize(body?.size);

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    const adminClient = getSupabaseAdminClient();

    const { data: apiSetting } = await adminClient
      .from("api_settings")
      .select("provider, model, encrypted_api_key")
      .eq("organization_id", membership.organization_id)
      .maybeSingle();

    let configured = false;
    let providerUsed = "Placeholder";
    let modelUsed = "picsum";

    if (
      apiSetting?.provider &&
      apiSetting?.model &&
      apiSetting?.encrypted_api_key &&
      apiSetting.encrypted_api_key.length > 0
    ) {
      try {
        const decryptedKey = decryptSecret(apiSetting.encrypted_api_key);
        if (decryptedKey.length > 0) {
          configured = true;
          providerUsed = apiSetting.provider;
          modelUsed = apiSetting.model;
        }
      } catch {
        configured = false;
      }
    }

    const [width, height] = size.split("x");
    const seed = createHash("sha256")
      .update(`${prompt}:${size}:${providerUsed}:${modelUsed}:band-joes-studio`)
      .digest("hex")
      .slice(0, 16);

    const imageUrl = `https://picsum.photos/seed/${seed}/${width}/${height}`;

    await incrementUsage(membership.organization_id);

    return NextResponse.json({ imageUrl, configured, providerUsed, modelUsed });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
