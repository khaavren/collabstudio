import { NextResponse } from "next/server";
import { RequestAuthError, requireAdminRequest } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import type { TeamRole } from "@/lib/types";

export const runtime = "nodejs";

function parseRole(value: unknown): TeamRole | null {
  if (value === "admin" || value === "editor" || value === "viewer") return value;
  return null;
}

export async function POST(request: Request) {
  try {
    const { organization } = await requireAdminRequest(request);
    const adminClient = getSupabaseAdminClient();

    const body = (await request.json().catch(() => null)) as
      | { email?: string; role?: TeamRole }
      | null;

    const email = body?.email?.trim().toLowerCase() ?? "";
    const role = parseRole(body?.role);

    if (!email || !role) {
      return NextResponse.json({ error: "Email and valid role are required." }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email is invalid." }, { status: 400 });
    }

    const origin = request.headers.get("origin") ?? "";
    const redirectTo = origin ? `${origin}/rooms` : undefined;

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo
      }
    );

    if (inviteError && !inviteError.message.toLowerCase().includes("already")) {
      throw new RequestAuthError(inviteError.message, 500);
    }

    let userId = inviteData.user?.id ?? null;

    if (!userId) {
      const { data: usersPage, error: usersError } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000
      });

      if (usersError) {
        throw new RequestAuthError(usersError.message, 500);
      }

      userId = usersPage.users.find((entry) => entry.email?.toLowerCase() === email)?.id ?? null;
    }

    if (userId) {
      const { error: memberError } = await adminClient.from("team_members").upsert(
        {
          organization_id: organization.id,
          user_id: userId,
          role
        },
        {
          onConflict: "organization_id,user_id"
        }
      );

      if (memberError) {
        throw new RequestAuthError(memberError.message, 500);
      }
    }

    return NextResponse.json({
      ok: true,
      linked: Boolean(userId),
      message: userId
        ? "Invite sent and member linked."
        : "Invite sent. Member will appear after account creation."
    });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
