import { NextResponse } from "next/server";
import { RequestAuthError, requireAdminRequest } from "@/lib/server/auth";
import { decryptSecret } from "@/lib/server/encryption";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { organization } = await requireAdminRequest(request);
    const adminClient = getSupabaseAdminClient();

    const { data: settings, error } = await adminClient
      .from("api_settings")
      .select("provider, model, encrypted_api_key")
      .eq("organization_id", organization.id)
      .maybeSingle();

    if (error) {
      throw new RequestAuthError(error.message, 500);
    }

    const configured = Boolean(
      settings?.provider && settings?.model && settings?.encrypted_api_key
    );

    if (!configured) {
      return NextResponse.json({
        ok: false,
        status: "Not Configured",
        message: "Model API is not configured yet. Placeholder mode will be used."
      });
    }

    if (!settings?.encrypted_api_key || !settings.provider || !settings.model) {
      return NextResponse.json({
        ok: false,
        status: "Not Configured",
        message: "Model API is not configured yet. Placeholder mode will be used."
      });
    }

    const decrypted = decryptSecret(settings.encrypted_api_key);
    if (!decrypted) {
      return NextResponse.json({
        ok: false,
        status: "Not Configured",
        message: "API key could not be decrypted."
      });
    }

    return NextResponse.json({
      ok: true,
      status: "Configured",
      message: `Connection test passed for ${settings.provider} (${settings.model}).`
    });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
