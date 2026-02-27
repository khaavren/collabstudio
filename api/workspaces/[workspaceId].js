import { getAuthenticatedUser } from "../_lib/auth.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "../_lib/http.js";
import { getSupabaseAdminClient } from "../_lib/supabase.js";
import { assertWorkspaceAdmin, getWorkspaceByIdForUser } from "../_lib/workspaces.js";

function workspaceIdFromReq(req) {
  return String(req.query.workspaceId ?? "").trim();
}

async function handleGet(req, res) {
  const user = await getAuthenticatedUser(req);
  const workspaceId = workspaceIdFromReq(req);
  if (!workspaceId) {
    sendJson(res, 400, { error: "Missing workspace id." });
    return;
  }

  const workspace = await getWorkspaceByIdForUser(user, workspaceId);
  if (!workspace) {
    sendJson(res, 404, { error: "Workspace not found." });
    return;
  }

  sendJson(res, 200, { workspace });
}

async function handlePatch(req, res) {
  const user = await getAuthenticatedUser(req);
  const workspaceId = workspaceIdFromReq(req);
  if (!workspaceId) {
    sendJson(res, 400, { error: "Missing workspace id." });
    return;
  }

  await assertWorkspaceAdmin(user, workspaceId);
  const body = (await getJsonBody(req)) ?? {};
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();

  if (!name) {
    sendJson(res, 400, { error: "Workspace name is required." });
    return;
  }

  const adminClient = getSupabaseAdminClient();
  const { error } = await adminClient
    .from("workspaces")
    .update({
      name,
      description,
      updated_at: new Date().toISOString()
    })
    .eq("id", workspaceId);

  if (error) {
    throw new HttpError(error.message, 500);
  }

  sendJson(res, 200, { ok: true });
}

async function handleDelete(req, res) {
  const user = await getAuthenticatedUser(req);
  const workspaceId = workspaceIdFromReq(req);
  if (!workspaceId) {
    sendJson(res, 400, { error: "Missing workspace id." });
    return;
  }

  await assertWorkspaceAdmin(user, workspaceId);
  const adminClient = getSupabaseAdminClient();
  const { error } = await adminClient.from("workspaces").delete().eq("id", workspaceId);
  if (error) {
    throw new HttpError(error.message, 500);
  }

  sendJson(res, 200, { ok: true });
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["GET", "PATCH", "DELETE"])) return;

  try {
    if (req.method === "GET") {
      await handleGet(req, res);
      return;
    }
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
