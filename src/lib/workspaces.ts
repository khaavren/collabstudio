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
  lastAccessed: string;
  collaborators: number;
  collaboratorsList: CollaboratorRecord[];
  color: string;
  owner: string;
  ownerName: string;
};

const WORKSPACES_STORAGE_KEY = "magisterludi.dashboard.workspaces.v2";
const LEGACY_WORKSPACES_STORAGE_KEY = "magisterludi.dashboard.workspaces";

const DEFAULT_WORKSPACES: WorkspaceRecord[] = [];

function isBrowser() {
  return typeof window !== "undefined";
}

function sanitizeCollaboratorRole(raw: unknown): CollaboratorRole {
  if (raw === "owner" || raw === "admin" || raw === "editor" || raw === "viewer") {
    return raw;
  }
  return "viewer";
}

function sanitizeCollaborator(raw: unknown): CollaboratorRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Partial<CollaboratorRecord>;
  if (!entry.id || !entry.email) return null;

  return {
    id: String(entry.id),
    name: String(entry.name ?? ""),
    email: String(entry.email),
    role: sanitizeCollaboratorRole(entry.role)
  };
}

function fallbackCollaborators(entry: Partial<WorkspaceRecord>): CollaboratorRecord[] {
  const ownerId = String(entry.owner ?? "");
  const ownerName = String(entry.ownerName ?? "").trim();
  if (!ownerId) return [];

  return [
    {
      id: ownerId,
      name: ownerName || "Owner",
      email: "",
      role: "owner"
    }
  ];
}

function sanitizeWorkspace(raw: unknown): WorkspaceRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Partial<WorkspaceRecord>;
  if (!entry.id || !entry.name) return null;

  const parsedCollaborators = Array.isArray(entry.collaboratorsList)
    ? entry.collaboratorsList
        .map((candidate) => sanitizeCollaborator(candidate))
        .filter((candidate): candidate is CollaboratorRecord => candidate !== null)
    : [];
  const collaboratorsList =
    parsedCollaborators.length > 0 ? parsedCollaborators : fallbackCollaborators(entry);
  const collaborators = Math.max(Number(entry.collaborators ?? collaboratorsList.length), collaboratorsList.length);

  return {
    id: String(entry.id),
    name: String(entry.name),
    description: String(entry.description ?? ""),
    roomCount: Number(entry.roomCount ?? 0),
    lastAccessed: String(entry.lastAccessed ?? ""),
    collaborators,
    collaboratorsList,
    color: String(entry.color ?? "var(--primary)"),
    owner: String(entry.owner ?? ""),
    ownerName: String(entry.ownerName ?? "")
  };
}

function isPlaceholderName(name: string) {
  const normalized = name.trim().toLowerCase();
  return (
    normalized === "john doe" ||
    normalized === "jane smith" ||
    normalized === "mike johnson" ||
    normalized === "emily davis" ||
    normalized === "chris lee" ||
    normalized.startsWith("member ")
  );
}

function isPlaceholderWorkspace(workspace: WorkspaceRecord) {
  const workspaceName = workspace.name.trim().toLowerCase();
  const hasDemoWorkspaceName =
    workspaceName === "product development" ||
    workspaceName === "industrial series" ||
    workspaceName === "marketing campaign" ||
    workspaceName === "design system";
  const hasDemoOwnerName = isPlaceholderName(workspace.ownerName);
  const hasDemoCollaborators = workspace.collaboratorsList.some(
    (collaborator) =>
      collaborator.email.toLowerCase().endsWith("@example.com") || isPlaceholderName(collaborator.name)
  );

  return hasDemoWorkspaceName || hasDemoOwnerName || hasDemoCollaborators;
}

function removePlaceholderSeedData(workspaces: WorkspaceRecord[]) {
  return workspaces.filter((workspace) => !isPlaceholderWorkspace(workspace));
}

export function getDefaultWorkspaces() {
  return [...DEFAULT_WORKSPACES];
}

export function loadWorkspaces() {
  if (!isBrowser()) {
    return getDefaultWorkspaces();
  }

  try {
    const raw =
      window.localStorage.getItem(WORKSPACES_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_WORKSPACES_STORAGE_KEY);
    if (!raw) return getDefaultWorkspaces();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return getDefaultWorkspaces();

    const next = parsed
      .map((entry) => sanitizeWorkspace(entry))
      .filter((entry): entry is WorkspaceRecord => entry !== null);

    const migrated = removePlaceholderSeedData(next);
    if (raw && window.localStorage.getItem(LEGACY_WORKSPACES_STORAGE_KEY)) {
      window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(migrated));
      window.localStorage.removeItem(LEGACY_WORKSPACES_STORAGE_KEY);
    }
    return migrated;
  } catch {
    return getDefaultWorkspaces();
  }
}

export function saveWorkspaces(workspaces: WorkspaceRecord[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(workspaces));
}

export function getWorkspaceNameById(workspaceId: string | null | undefined) {
  if (!workspaceId) return null;
  const workspace = loadWorkspaces().find((entry) => entry.id === workspaceId);
  return workspace?.name ?? null;
}
