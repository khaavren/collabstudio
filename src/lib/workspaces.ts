import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/utils";

export type CollaboratorRole = "owner" | "admin" | "editor" | "viewer";

export type CollaboratorRecord = {
  id: string;
  name: string;
  email: string;
  role: CollaboratorRole;
};

export type WorkspaceRecord = {
  id: string;
  name: string;
  description: string;
  roomCount: number;
  defaultRoomSlug: string | null;
  lastAccessed: string;
  collaborators: number;
  collaboratorsList: CollaboratorRecord[];
  color: string;
  owner: string;
  ownerName: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  owner_id: string;
  owner_name: string | null;
  owner_email: string | null;
  updated_at: string;
};

type WorkspaceCollaboratorRow = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  email: string;
  display_name: string | null;
  role: CollaboratorRole;
};

type RoomRow = {
  id: string;
  slug: string;
  workspace_id: string | null;
  created_at: string;
};

function normalizeRole(value: string): CollaboratorRole {
  if (value === "owner" || value === "admin" || value === "editor" || value === "viewer") {
    return value;
  }
  return "viewer";
}

function toDisplayName(email: string) {
  return email
    .split("@")[0]
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getDefaultWorkspaces() {
  return [] as WorkspaceRecord[];
}

function buildWorkspaceRecords(
  workspaces: WorkspaceRow[],
  collaborators: WorkspaceCollaboratorRow[],
  rooms: RoomRow[]
) {
  const collaboratorsByWorkspace = new Map<string, WorkspaceCollaboratorRow[]>();
  collaborators.forEach((row) => {
    const current = collaboratorsByWorkspace.get(row.workspace_id) ?? [];
    current.push(row);
    collaboratorsByWorkspace.set(row.workspace_id, current);
  });

  const roomsByWorkspace = new Map<string, RoomRow[]>();
  rooms.forEach((row) => {
    if (!row.workspace_id) return;
    const current = roomsByWorkspace.get(row.workspace_id) ?? [];
    current.push(row);
    roomsByWorkspace.set(row.workspace_id, current);
  });

  return workspaces.map((workspace) => {
    const workspaceCollaborators = collaboratorsByWorkspace.get(workspace.id) ?? [];
    const collaboratorList: CollaboratorRecord[] = workspaceCollaborators.map((entry) => ({
      id: entry.id,
      name: entry.display_name?.trim() || toDisplayName(entry.email),
      email: entry.email,
      role: normalizeRole(entry.role)
    }));

    const workspaceRooms = (roomsByWorkspace.get(workspace.id) ?? []).sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );

    return {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description ?? "",
      roomCount: workspaceRooms.length,
      defaultRoomSlug: workspaceRooms[0]?.slug ?? null,
      lastAccessed: timeAgo(workspace.updated_at),
      collaborators: collaboratorList.length,
      collaboratorsList: collaboratorList,
      color: workspace.color || "var(--primary)",
      owner: workspace.owner_id,
      ownerName: workspace.owner_name?.trim() || toDisplayName(workspace.owner_email ?? "owner@workspace")
    } satisfies WorkspaceRecord;
  });
}

export async function fetchWorkspacesForUser(params: { userId: string; email: string | null }) {
  if (!isSupabaseConfigured) return getDefaultWorkspaces();
  if (!params.userId) return getDefaultWorkspaces();

  const normalizedEmail = params.email?.trim().toLowerCase() ?? "";
  const orFilter = normalizedEmail
    ? `user_id.eq.${params.userId},email.eq.${normalizedEmail}`
    : `user_id.eq.${params.userId}`;

  const memberLookup = await supabase
    .from("workspace_collaborators")
    .select("workspace_id")
    .or(orFilter);

  if (memberLookup.error) {
    throw new Error(memberLookup.error.message || "Unable to load workspaces.");
  }

  const workspaceIds = Array.from(
    new Set((memberLookup.data ?? []).map((entry) => entry.workspace_id).filter(Boolean))
  );

  if (workspaceIds.length === 0) {
    return getDefaultWorkspaces();
  }

  const [workspaceQuery, collaboratorQuery, roomQuery] = await Promise.all([
    supabase.from("workspaces").select("*").in("id", workspaceIds).order("updated_at", { ascending: false }),
    supabase.from("workspace_collaborators").select("*").in("workspace_id", workspaceIds),
    supabase.from("rooms").select("id,slug,workspace_id,created_at").in("workspace_id", workspaceIds)
  ]);

  if (workspaceQuery.error) {
    throw new Error(workspaceQuery.error.message || "Unable to load workspaces.");
  }
  if (collaboratorQuery.error) {
    throw new Error(collaboratorQuery.error.message || "Unable to load collaborators.");
  }
  if (roomQuery.error) {
    throw new Error(roomQuery.error.message || "Unable to load rooms.");
  }

  return buildWorkspaceRecords(
    (workspaceQuery.data ?? []) as WorkspaceRow[],
    (collaboratorQuery.data ?? []) as WorkspaceCollaboratorRow[],
    (roomQuery.data ?? []) as RoomRow[]
  );
}

export async function createWorkspaceForUser(params: {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  name: string;
  description: string;
  color?: string;
}) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const nextName = params.name.trim();
  if (!nextName) {
    throw new Error("Workspace name is required.");
  }

  const { data, error } = await supabase
    .from("workspaces")
    .insert({
      name: nextName,
      description: params.description.trim(),
      color: params.color ?? "var(--primary)",
      owner_id: params.ownerId,
      owner_name: params.ownerName.trim(),
      owner_email: params.ownerEmail.trim().toLowerCase()
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to create workspace.");
  }

  const { error: collaboratorError } = await supabase.from("workspace_collaborators").insert({
    workspace_id: data.id,
    user_id: params.ownerId,
    email: params.ownerEmail.trim().toLowerCase(),
    display_name: params.ownerName.trim(),
    role: "owner"
  });

  if (collaboratorError) {
    throw new Error(collaboratorError.message || "Workspace created but collaborator setup failed.");
  }

  return data.id as string;
}

export async function updateWorkspaceById(
  workspaceId: string,
  next: { name: string; description: string }
) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase
    .from("workspaces")
    .update({
      name: next.name.trim(),
      description: next.description.trim(),
      updated_at: new Date().toISOString()
    })
    .eq("id", workspaceId);

  if (error) {
    throw new Error(error.message || "Unable to update workspace.");
  }
}

export async function deleteWorkspaceById(workspaceId: string) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.from("workspaces").delete().eq("id", workspaceId);
  if (error) {
    throw new Error(error.message || "Unable to delete workspace.");
  }
}

export async function inviteWorkspaceCollaborator(
  workspaceId: string,
  email: string,
  role: CollaboratorRole
) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const { error } = await supabase.from("workspace_collaborators").insert({
    workspace_id: workspaceId,
    email: normalizedEmail,
    display_name: toDisplayName(normalizedEmail),
    role
  });

  if (error) {
    throw new Error(error.message || "Unable to invite collaborator.");
  }
}

export async function removeWorkspaceCollaborator(collaboratorId: string) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.from("workspace_collaborators").delete().eq("id", collaboratorId);
  if (error) {
    throw new Error(error.message || "Unable to remove collaborator.");
  }
}

export async function updateWorkspaceCollaboratorRole(
  collaboratorId: string,
  role: Exclude<CollaboratorRole, "owner">
) {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase
    .from("workspace_collaborators")
    .update({
      role
    })
    .eq("id", collaboratorId);

  if (error) {
    throw new Error(error.message || "Unable to update collaborator role.");
  }
}

export async function fetchWorkspaceNameById(workspaceId: string | null | undefined) {
  if (!workspaceId || !isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error || !data) return null;
  return data.name as string;
}
