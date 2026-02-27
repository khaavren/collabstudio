import { HttpError } from "./http.js";
import { getSupabaseAdminClient } from "./supabase.js";

function normalizeRole(value) {
  return value === "owner" || value === "admin" || value === "editor" || value === "viewer"
    ? value
    : "viewer";
}

function toDisplayNameFromEmail(email) {
  return String(email)
    .split("@")[0]
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizedEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function unique(values) {
  return Array.from(new Set(values));
}

export async function listWorkspacesForUser(user) {
  const adminClient = getSupabaseAdminClient();
  const email = normalizedEmail(user.email);
  const membershipFilter = email
    ? `user_id.eq.${user.id},email.eq.${email}`
    : `user_id.eq.${user.id}`;

  const { data: memberRows, error: membersError } = await adminClient
    .from("workspace_collaborators")
    .select("workspace_id")
    .or(membershipFilter);

  if (membersError) {
    throw new HttpError(membersError.message, 500);
  }

  const workspaceIds = unique((memberRows ?? []).map((entry) => entry.workspace_id).filter(Boolean));
  if (workspaceIds.length === 0) {
    return [];
  }

  const [workspaceQuery, collaboratorQuery, roomQuery] = await Promise.all([
    adminClient.from("workspaces").select("*").in("id", workspaceIds).order("updated_at", { ascending: false }),
    adminClient.from("workspace_collaborators").select("*").in("workspace_id", workspaceIds),
    adminClient
      .from("rooms")
      .select("id, slug, workspace_id, created_at")
      .in("workspace_id", workspaceIds)
  ]);

  if (workspaceQuery.error) {
    throw new HttpError(workspaceQuery.error.message, 500);
  }
  if (collaboratorQuery.error) {
    throw new HttpError(collaboratorQuery.error.message, 500);
  }
  if (roomQuery.error) {
    throw new HttpError(roomQuery.error.message, 500);
  }

  const collaboratorsByWorkspace = new Map();
  (collaboratorQuery.data ?? []).forEach((row) => {
    const current = collaboratorsByWorkspace.get(row.workspace_id) ?? [];
    current.push(row);
    collaboratorsByWorkspace.set(row.workspace_id, current);
  });

  const roomsByWorkspace = new Map();
  (roomQuery.data ?? []).forEach((row) => {
    if (!row.workspace_id) return;
    const current = roomsByWorkspace.get(row.workspace_id) ?? [];
    current.push(row);
    roomsByWorkspace.set(row.workspace_id, current);
  });

  return (workspaceQuery.data ?? []).map((workspace) => {
    const collaborators = (collaboratorsByWorkspace.get(workspace.id) ?? []).map((entry) => ({
      id: entry.id,
      name: entry.display_name?.trim() || toDisplayNameFromEmail(entry.email),
      email: entry.email,
      role: normalizeRole(entry.role)
    }));
    const rooms = (roomsByWorkspace.get(workspace.id) ?? []).sort((left, right) =>
      String(left.created_at).localeCompare(String(right.created_at))
    );

    return {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description ?? "",
      roomCount: rooms.length,
      defaultRoomSlug: rooms[0]?.slug ?? null,
      lastAccessed: workspace.updated_at,
      collaborators: collaborators.length,
      collaboratorsList: collaborators,
      color: workspace.color ?? "var(--primary)",
      owner: workspace.owner_id,
      ownerName:
        workspace.owner_name?.trim() ||
        toDisplayNameFromEmail(workspace.owner_email ?? user.email ?? "owner@workspace")
    };
  });
}

export async function assertWorkspaceAdmin(user, workspaceId) {
  const adminClient = getSupabaseAdminClient();
  const email = normalizedEmail(user.email);
  const { data: workspace, error: workspaceError } = await adminClient
    .from("workspaces")
    .select("id, owner_id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceError) {
    throw new HttpError(workspaceError.message, 500);
  }
  if (!workspace) {
    throw new HttpError("Workspace not found.", 404);
  }
  if (workspace.owner_id === user.id) {
    return workspace;
  }

  const membershipFilter = email
    ? `user_id.eq.${user.id},email.eq.${email}`
    : `user_id.eq.${user.id}`;

  const { data: membership, error: membershipError } = await adminClient
    .from("workspace_collaborators")
    .select("id, role")
    .eq("workspace_id", workspaceId)
    .or(membershipFilter)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new HttpError(membershipError.message, 500);
  }
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new HttpError("Not authorized.", 403);
  }

  return workspace;
}

export async function getWorkspaceByIdForUser(user, workspaceId) {
  const list = await listWorkspacesForUser(user);
  return list.find((entry) => entry.id === workspaceId) ?? null;
}
