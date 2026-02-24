import { NextResponse } from "next/server";
import { RequestAuthError, requireAdminRequest } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { organization, membership, user } = await requireAdminRequest(request);

    return NextResponse.json({
      authorized: true,
      organizationId: organization.id,
      role: membership.role,
      email: user.email ?? null
    });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      if (error.status === 403) {
        return NextResponse.json({ authorized: false, message: "Not authorized" }, { status: 403 });
      }

      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
