import { requireAdmin } from "../../_lib/auth.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "../../_lib/http.js";
import { getSupabaseAdminClient } from "../../_lib/supabase.js";

function parseRole(value) {
  return value === "admin" || value === "editor" || value === "viewer" ? value : null;
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["POST"])) return;

  try {
    const { organization } = await requireAdmin(req);
    const adminClient = getSupabaseAdminClient();
    const body = (await getJsonBody(req)) ?? {};

    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const role = parseRole(body.role);

    if (!email || !role) {
      sendJson(res, 400, { error: "Email and valid role are required." });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendJson(res, 400, { error: "Email is invalid." });
      return;
    }

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const origin = host ? `${protocol}://${host}` : "";
    const redirectTo = origin ? `${origin}/admin` : undefined;

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo
      }
    );

    if (inviteError && !inviteError.message.toLowerCase().includes("already")) {
      throw new HttpError(inviteError.message, 500);
    }

    let userId = inviteData.user?.id ?? null;

    if (!userId) {
      const { data: usersPage, error: usersError } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000
      });

      if (usersError) {
        throw new HttpError(usersError.message, 500);
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
        throw new HttpError(memberError.message, 500);
      }
    }

    sendJson(res, 200, {
      ok: true,
      linked: Boolean(userId),
      message: userId
        ? "Invite sent and member linked."
        : "Invite sent. Member will appear after account creation."
    });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    sendJson(res, 500, { error: "Unexpected server error." });
  }
}
