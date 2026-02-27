import { getAuthenticatedUser } from "../../../_lib/auth.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "../../../_lib/http.js";
import { getSupabaseAdminClient } from "../../../_lib/supabase.js";
import { assertWorkspaceAdmin } from "../../../_lib/workspaces.js";

function parseRole(value) {
  return value === "admin" || value === "editor" || value === "viewer" ? value : null;
}

function collaboratorIdFromReq(req) {
  return String(req.query.collaboratorId ?? "").trim();
}

async function loadCollaborator(adminClient, collaboratorId) {
  const { data, error } = await adminClient
    .from("workspace_collaborators")
    .select("id, workspace_id, role")
    .eq("id", collaboratorId)
    .maybeSingle();

  if (error) {
    throw new HttpError(error.message, 500);
  }
  if (!data) {
    throw new HttpError("Collaborator not found.", 404);
  }
  return data;
}

async function handlePatch(req, res) {
  const user = await getAuthenticatedUser(req);
  const collaboratorId = collaboratorIdFromReq(req);
  if (!collaboratorId) {
    sendJson(res, 400, { error: "Missing collaborator id." });
    return;
  }

  const adminClient = getSupabaseAdminClient();
  const collaborator = await loadCollaborator(adminClient, collaboratorId);
  if (collaborator.role === "owner") {
    sendJson(res, 400, { error: "Owner role cannot be changed." });
    return;
  }

  await assertWorkspaceAdmin(user, collaborator.workspace_id);
  const body = (await getJsonBody(req)) ?? {};
  const role = parseRole(body.role);
  if (!role) {
    sendJson(res, 400, { error: "Invalid role." });
    return;
  }

  const { error } = await adminClient
    .from("workspace_collaborators")
    .update({ role })
    .eq("id", collaboratorId);
  if (error) {
    throw new HttpError(error.message, 500);
  }

  sendJson(res, 200, { ok: true });
}

async function handleDelete(req, res) {
  const user = await getAuthenticatedUser(req);
  const collaboratorId = collaboratorIdFromReq(req);
  if (!collaboratorId) {
    sendJson(res, 400, { error: "Missing collaborator id." });
    return;
  }

  const adminClient = getSupabaseAdminClient();
  const collaborator = await loadCollaborator(adminClient, collaboratorId);
  if (collaborator.role === "owner") {
    sendJson(res, 400, { error: "Owner cannot be removed." });
    return;
  }

  await assertWorkspaceAdmin(user, collaborator.workspace_id);

  const { error } = await adminClient
    .from("workspace_collaborators")
    .delete()
    .eq("id", collaboratorId);
  if (error) {
    throw new HttpError(error.message, 500);
  }

  sendJson(res, 200, { ok: true });
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["PATCH", "DELETE"])) return;

  try {
    if (req.method === "PATCH") {
      await handlePatch(req, res);
      return;
    }
    await handleDelete(req, res);
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    sendJson(res, 500, { error: "Unexpected server error." });
  }
}
