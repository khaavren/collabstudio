import { getAuthenticatedUser } from "../../_lib/auth.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "../../_lib/http.js";
import { getSupabaseAdminClient } from "../../_lib/supabase.js";
import { assertWorkspaceAdmin } from "../../_lib/workspaces.js";

function toDisplayName(email) {
  return String(email)
    .split("@")[0]
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseRole(value) {
  return value === "admin" || value === "editor" || value === "viewer" ? value : null;
}

function workspaceIdFromReq(req) {
  return String(req.query.workspaceId ?? "").trim();
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["POST"])) return;

  try {
    const user = await getAuthenticatedUser(req);
    const workspaceId = workspaceIdFromReq(req);
    if (!workspaceId) {
      sendJson(res, 400, { error: "Missing workspace id." });
      return;
    }

    await assertWorkspaceAdmin(user, workspaceId);
    const body = (await getJsonBody(req)) ?? {};
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const role = parseRole(body.role);

    if (!email || !role) {
      sendJson(res, 400, { error: "Email and role are required." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendJson(res, 400, { error: "Email is invalid." });
      return;
    }

    const adminClient = getSupabaseAdminClient();
    const { error } = await adminClient.from("workspace_collaborators").insert({
      workspace_id: workspaceId,
      email,
      display_name: toDisplayName(email),
      role
    });

    if (error) {
      throw new HttpError(error.message, 500);
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
