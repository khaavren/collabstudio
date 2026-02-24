import { NextResponse } from "next/server";
import { RequestAuthError, requireAdminRequest } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import type { TeamRole } from "@/lib/types";

export const runtime = "nodejs";

function parseRole(value: unknown): TeamRole | null {
  if (value === "admin" || value === "editor" || value === "viewer") return value;
  return null;
}

export async function PATCH(
  request: Request,
  context: { params: { memberId: string } }
) {
  try {
    const { organization, user } = await requireAdminRequest(request);
    const adminClient = getSupabaseAdminClient();

    const memberId = context.params.memberId;
    const body = (await request.json().catch(() => null)) as { role?: TeamRole } | null;
    const role = parseRole(body?.role);

    if (!role) {
      return NextResponse.json({ error: "Valid role is required." }, { status: 400 });
    }

    const { data: existingMember, error: memberLookupError } = await adminClient
      .from("team_members")
      .select("id, user_id")
      .eq("id", memberId)
      .eq("organization_id", organization.id)
      .single();

    if (memberLookupError || !existingMember) {
      return NextResponse.json({ error: "Team member not found." }, { status: 404 });
    }

    if (existingMember.user_id === user.id && role !== "admin") {
      return NextResponse.json(
        { error: "You cannot remove your own admin access." },
        { status: 400 }
      );
    }

    const { error: updateError } = await adminClient
      .from("team_members")
      .update({ role })
      .eq("id", memberId)
      .eq("organization_id", organization.id);

    if (updateError) {
      throw new RequestAuthError(updateError.message, 500);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: { memberId: string } }
) {
  try {
    const { organization, user } = await requireAdminRequest(request);
    const adminClient = getSupabaseAdminClient();

    const memberId = context.params.memberId;

    const { data: existingMember, error: lookupError } = await adminClient
      .from("team_members")
      .select("id, user_id")
      .eq("id", memberId)
      .eq("organization_id", organization.id)
      .single();

    if (lookupError || !existingMember) {
      return NextResponse.json({ error: "Team member not found." }, { status: 404 });
    }

    if (existingMember.user_id === user.id) {
      return NextResponse.json({ error: "You cannot remove yourself." }, { status: 400 });
    }

    const { error: deleteError } = await adminClient
      .from("team_members")
      .delete()
      .eq("id", memberId)
      .eq("organization_id", organization.id);

    if (deleteError) {
      throw new RequestAuthError(deleteError.message, 500);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
