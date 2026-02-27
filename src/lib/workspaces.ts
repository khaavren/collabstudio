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

const WORKSPACES_STORAGE_KEY = "magisterludi.dashboard.workspaces";

const DEFAULT_WORKSPACES: WorkspaceRecord[] = [
  {
    id: "1",
    name: "Product Development",
    description: "Main product development workspace",
    roomCount: 4,
    lastAccessed: "2 hours ago",
    collaborators: 5,
    collaboratorsList: [
      { id: "1", name: "John Doe", email: "john.doe@example.com", role: "owner" },
      { id: "2", name: "Jane Smith", email: "jane.smith@example.com", role: "editor" },
      { id: "3", name: "Mike Johnson", email: "mike.johnson@example.com", role: "viewer" },
      { id: "4", name: "Emily Davis", email: "emily.davis@example.com", role: "admin" },
      { id: "5", name: "Chris Lee", email: "chris.lee@example.com", role: "editor" }
    ],
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
    collaboratorsList: [
      { id: "1", name: "John Doe", email: "john.doe@example.com", role: "owner" },
      { id: "6", name: "Alex Carter", email: "alex.carter@example.com", role: "admin" },
      { id: "7", name: "Taylor Nguyen", email: "taylor.nguyen@example.com", role: "editor" }
    ],
    color: "#2563eb",
    owner: "1",
    ownerName: "John Doe"
  }
];

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
  const ownerId = String(entry.owner ?? "owner");
  const ownerName = String(entry.ownerName ?? "Owner");
  const ownerEmail = `${ownerName.toLowerCase().replace(/\s+/g, ".") || "owner"}@example.com`;
  const total = Math.max(Number(entry.collaborators ?? 1), 1);

  const list: CollaboratorRecord[] = [
    {
      id: ownerId,
      name: ownerName,
      email: ownerEmail,
      role: "owner"
    }
  ];

  for (let index = 1; index < total; index += 1) {
    const n = index + 1;
    list.push({
      id: `${String(entry.id ?? "workspace")}-member-${n}`,
      name: `Member ${n}`,
      email: `member${n}@example.com`,
      role: "viewer"
    });
  }

  return list;
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
