import { fetchWithAuth } from "@/lib/admin";
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

type WorkspaceApiRecord = Omit<WorkspaceRecord, "lastAccessed"> & {
  lastAccessed: string;
};

function toUserError(responseBody: unknown, fallback: string) {
  if (responseBody && typeof responseBody === "object" && "error" in responseBody) {
    const message = String((responseBody as { error?: string }).error ?? "").trim();
    if (message) return message;
  }
  return fallback;
}

async function requestJson<T>(input: string, init?: RequestInit, fallbackError = "Request failed.") {
  let response: Response;
  try {
    response = await fetchWithAuth(input, init);
  } catch (error) {
    if (error instanceof Error && error.message.trim()) {
      throw new Error(error.message);
    }
    throw new Error("Network error: unable to reach application API.");
  }

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(toUserError(payload, fallbackError));
  }

  return payload;
}

function mapWorkspaceRecords(workspaces: WorkspaceApiRecord[]) {
  return workspaces.map((workspace) => ({
    ...workspace,
    lastAccessed: timeAgo(workspace.lastAccessed)
  }));
}

export function getDefaultWorkspaces() {
  return [] as WorkspaceRecord[];
}

export async function fetchWorkspacesForUser(_params: { userId: string; email: string | null }) {
  const payload = await requestJson<{ workspaces: WorkspaceApiRecord[] }>(
    "/api/workspaces",
    {
      method: "GET"
    },
    "Unable to load workspaces."
  );

  return mapWorkspaceRecords(payload.workspaces ?? []);
}

export async function createWorkspaceForUser(params: {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  name: string;
  description: string;
  color?: string;
}) {
  const payload = await requestJson<{ workspaceId: string }>(
    "/api/workspaces",
    {
      method: "POST",
      body: JSON.stringify({
        name: params.name,
        description: params.description,
        ownerName: params.ownerName,
        ownerEmail: params.ownerEmail,
        color: params.color
      })
    },
    "Unable to create workspace."
  );

  return payload.workspaceId;
}

export async function updateWorkspaceById(
  workspaceId: string,
  next: { name: string; description: string }
) {
  await requestJson(
    `/api/workspaces/${workspaceId}`,
    {
      method: "PATCH",
      body: JSON.stringify(next)
    },
    "Unable to update workspace."
  );
}

export async function deleteWorkspaceById(workspaceId: string) {
  await requestJson(
    `/api/workspaces/${workspaceId}`,
    {
      method: "DELETE"
    },
    "Unable to delete workspace."
  );
}

export async function inviteWorkspaceCollaborator(
  workspaceId: string,
  email: string,
  role: CollaboratorRole
) {
  await requestJson(
    `/api/workspaces/${workspaceId}/collaborators`,
    {
      method: "POST",
      body: JSON.stringify({ email, role })
    },
    "Unable to invite collaborator."
  );
}

export async function removeWorkspaceCollaborator(collaboratorId: string) {
  await requestJson(
    `/api/workspaces/collaborators/${collaboratorId}`,
    {
      method: "DELETE"
    },
    "Unable to remove collaborator."
  );
}

export async function updateWorkspaceCollaboratorRole(
  collaboratorId: string,
  role: Exclude<CollaboratorRole, "owner">
) {
  await requestJson(
    `/api/workspaces/collaborators/${collaboratorId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role })
    },
    "Unable to update collaborator role."
  );
}

export async function fetchWorkspaceNameById(workspaceId: string | null | undefined) {
  if (!workspaceId) return null;

  const payload = await requestJson<{ workspace: WorkspaceApiRecord }>(
    `/api/workspaces/${workspaceId}`,
    {
      method: "GET"
    },
    "Unable to load workspace."
  );

  return payload.workspace?.name ?? null;
}
