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
  },
  {
    id: "3",
    name: "Marketing Campaign",
    description: "Q2 marketing materials and assets",
    roomCount: 3,
    lastAccessed: "3 days ago",
    collaborators: 4,
    color: "#9333ea",
    owner: "2",
    ownerName: "Jane Smith"
  },
  {
    id: "4",
    name: "Design System",
    description: "Company-wide design components",
    roomCount: 5,
    lastAccessed: "4 days ago",
    collaborators: 8,
    color: "#16a34a",
    owner: "3",
    ownerName: "Mike Johnson"
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

    return next.length > 0 ? next : getDefaultWorkspaces();
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
