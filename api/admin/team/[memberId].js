import { requireAdmin } from "../../_lib/auth.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "../../_lib/http.js";
import { getSupabaseAdminClient } from "../../_lib/supabase.js";

function parseRole(value) {
  return value === "admin" || value === "editor" || value === "viewer" ? value : null;
}

function getMemberId(req) {
  if (req.query?.memberId) {
    return String(req.query.memberId);
  }

  const match = req.url?.match(/\/api\/admin\/team\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["PATCH", "DELETE"])) return;

  try {
    const { organization, user } = await requireAdmin(req);
    const adminClient = getSupabaseAdminClient();
    const memberId = getMemberId(req);

    if (!memberId) {
      sendJson(res, 400, { error: "Missing team member id." });
      return;
    }

    if (req.method === "PATCH") {
      const body = (await getJsonBody(req)) ?? {};
      const role = parseRole(body.role);

      if (!role) {
        sendJson(res, 400, { error: "Valid role is required." });
        return;
      }

      const { data: existingMember, error: lookupError } = await adminClient
        .from("team_members")
        .select("id, user_id")
        .eq("id", memberId)
        .eq("organization_id", organization.id)
        .single();

      if (lookupError || !existingMember) {
        sendJson(res, 404, { error: "Team member not found." });
        return;
      }

      if (existingMember.user_id === user.id && role !== "admin") {
        sendJson(res, 400, { error: "You cannot remove your own admin access." });
        return;
      }

      const { error: updateError } = await adminClient
        .from("team_members")
        .update({ role })
        .eq("id", memberId)
        .eq("organization_id", organization.id);

      if (updateError) {
        throw new HttpError(updateError.message, 500);
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    const { data: existingMember, error: lookupError } = await adminClient
      .from("team_members")
      .select("id, user_id")
      .eq("id", memberId)
      .eq("organization_id", organization.id)
      .single();

    if (lookupError || !existingMember) {
      sendJson(res, 404, { error: "Team member not found." });
      return;
    }

    if (existingMember.user_id === user.id) {
      sendJson(res, 400, { error: "You cannot remove yourself." });
      return;
    }

    const { error: deleteError } = await adminClient
      .from("team_members")
      .delete()
      .eq("id", memberId)
      .eq("organization_id", organization.id);

    if (deleteError) {
      throw new HttpError(deleteError.message, 500);
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    sendJson(res, 500, { error: "Unexpected server error." });
  }
}
