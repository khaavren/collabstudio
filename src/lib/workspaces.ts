export type WorkspaceRecord = {
  id: string;
  name: string;
  description: string;
  roomCount: number;
  lastAccessed: string;
  collaborators: number;
  color: string;
  owner: string;
  ownerName: string;
};

const WORKSPACES_STORAGE_KEY = "magisterludi.dashboard.workspaces";

const DEFAULT_WORKSPACES: WorkspaceRecord[] = [
  {
    id: "1",
    name: "Product Development",
    description: "Main product development workspace",
    roomCount: 4,
    lastAccessed: "2 hours ago",
    collaborators: 5,
    color: "var(--primary)",
    owner: "1",
    ownerName: "John Doe"
  },
  {
    id: "2",
    name: "Industrial Series",
    description: "Heavy-duty industrial equipment",
    roomCount: 2,
    lastAccessed: "1 day ago",
    collaborators: 3,
    color: "#2563eb",
    owner: "1",
    ownerName: "John Doe"
  }
];

function isBrowser() {
  return typeof window !== "undefined";
}

function sanitizeWorkspace(raw: unknown): WorkspaceRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Partial<WorkspaceRecord>;
  if (!entry.id || !entry.name) return null;

  return {
    id: String(entry.id),
    name: String(entry.name),
    description: String(entry.description ?? ""),
    roomCount: Number(entry.roomCount ?? 0),
    lastAccessed: String(entry.lastAccessed ?? ""),
    collaborators: Number(entry.collaborators ?? 0),
    color: String(entry.color ?? "var(--primary)"),
    owner: String(entry.owner ?? ""),
    ownerName: String(entry.ownerName ?? "")
  };
}

function removeLegacySharedPlaceholders(workspaces: WorkspaceRecord[]) {
  return workspaces.filter((workspace) => {
    const isLegacyMarketing =
      workspace.id === "3" &&
      workspace.name === "Marketing Campaign" &&
      workspace.ownerName === "Jane Smith";
    const isLegacyDesignSystem =
      workspace.id === "4" && workspace.name === "Design System" && workspace.ownerName === "Mike Johnson";

    return !isLegacyMarketing && !isLegacyDesignSystem;
  });
}

export function getDefaultWorkspaces() {
  return [...DEFAULT_WORKSPACES];
}

export function loadWorkspaces() {
  if (!isBrowser()) {
    return getDefaultWorkspaces();
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACES_STORAGE_KEY);
    if (!raw) return getDefaultWorkspaces();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return getDefaultWorkspaces();

    const next = parsed
      .map((entry) => sanitizeWorkspace(entry))
      .filter((entry): entry is WorkspaceRecord => entry !== null);

    const migrated = removeLegacySharedPlaceholders(next);
    return migrated.length > 0 ? migrated : getDefaultWorkspaces();
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
