import { getAuthenticatedUser } from "../_lib/auth.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "../_lib/http.js";
import { getSupabaseAdminClient } from "../_lib/supabase.js";
import { listWorkspacesForUser } from "../_lib/workspaces.js";

function parseColor(value) {
  if (typeof value !== "string") return "var(--primary)";
  const trimmed = value.trim();
  return trimmed || "var(--primary)";
}

async function handleGet(req, res) {
  const user = await getAuthenticatedUser(req);
  const workspaces = await listWorkspacesForUser(user);
  sendJson(res, 200, { workspaces });
}

async function handlePost(req, res) {
  const user = await getAuthenticatedUser(req);
  const body = (await getJsonBody(req)) ?? {};
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const color = parseColor(body.color);

  if (!name) {
    sendJson(res, 400, { error: "Workspace name is required." });
    return;
  }

  const adminClient = getSupabaseAdminClient();
  const ownerName = String(body.ownerName ?? "").trim() || user.email?.split("@")[0] || "Owner";
  const ownerEmail = String(body.ownerEmail ?? user.email ?? "")
    .trim()
    .toLowerCase();

  const { data, error } = await adminClient
    .from("workspaces")
    .insert({
      name,
      description,
      color,
      owner_id: user.id,
      owner_name: ownerName,
      owner_email: ownerEmail || null
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new HttpError(error?.message ?? "Unable to create workspace.", 500);
  }

  const { error: collaboratorError } = await adminClient.from("workspace_collaborators").insert({
    workspace_id: data.id,
    user_id: user.id,
    email: ownerEmail || `${user.id}@workspace.local`,
    display_name: ownerName,
    role: "owner"
  });

  if (collaboratorError) {
    throw new HttpError(collaboratorError.message, 500);
  }

  sendJson(res, 200, { workspaceId: data.id });
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["GET", "POST"])) return;

  try {
    if (req.method === "GET") {
      await handleGet(req, res);
      return;
    }

    await handlePost(req, res);
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    sendJson(res, 500, { error: "Unexpected server error." });
  }
}
