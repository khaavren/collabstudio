import { useEffect, useMemo, useState } from "react";
import { Mail, Shield, Trash2, UserPlus, X } from "lucide-react";

export interface Collaborator {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "editor" | "viewer";
}

interface InviteCollaboratorsModalProps {
  workspaceName: string;
  workspaceId: string;
  currentCollaborators: Collaborator[];
  onClose: () => void;
  onInvite: (email: string, role: string) => void;
  onRemove: (collaboratorId: string) => void;
  onRoleChange: (collaboratorId: string, newRole: string) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function roleBadgeClass(role: Collaborator["role"]) {
  if (role === "owner") return "bg-[var(--primary)]/10 text-[var(--primary)]";
  if (role === "admin") return "bg-purple-600/10 text-purple-600";
  if (role === "editor") return "bg-blue-600/10 text-blue-600";
  return "bg-[var(--muted)] text-[var(--muted-foreground)]";
}

export function InviteCollaboratorsModal({
  workspaceName,
  workspaceId,
  currentCollaborators,
  onClose,
  onInvite,
  onRemove,
  onRoleChange
}: InviteCollaboratorsModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor" | "admin">("viewer");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    setEmail("");
    setRole("viewer");
    setStatus(null);
  }, [workspaceId]);

  useEffect(() => {
    if (!status || status.type !== "success") return;
    const timer = window.setTimeout(() => setStatus(null), 3000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const collaboratorEmails = useMemo(
    () => new Set(currentCollaborators.map((collaborator) => collaborator.email.toLowerCase())),
    [currentCollaborators]
  );

  function handleInvite() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setStatus({ type: "error", message: "Enter a valid email address." });
      return;
    }

    if (collaboratorEmails.has(normalizedEmail)) {
      setStatus({ type: "error", message: "This collaborator is already in the workspace." });
      return;
    }

    onInvite(normalizedEmail, role);
    setEmail("");
    setRole("viewer");
    setStatus({ type: "success", message: "Invitation sent." });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              Invite Collaborators
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">{workspaceName}</p>
          </div>
          <button
            className="rounded-md p-1 text-[var(--muted-foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-[var(--foreground)]">Invite by email</h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px_auto]">
              <label className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                <input
                  className="w-full rounded-lg border border-[var(--border)] bg-white py-2.5 pl-9 pr-3 text-sm text-[var(--foreground)] outline-none"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@company.com"
                  type="email"
                  value={email}
                />
              </label>
              <select
                className="rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--foreground)] outline-none"
                onChange={(event) => setRole(event.target.value as "viewer" | "editor" | "admin")}
                value={role}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                onClick={handleInvite}
                type="button"
              >
                <UserPlus className="h-4 w-4" />
                Send Invitation
              </button>
            </div>
            {status ? (
              <p
                className={`text-sm ${
                  status.type === "success" ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {status.message}
              </p>
            ) : null}
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--accent)] p-4">
            <div className="flex items-start gap-2">
              <Shield className="mt-0.5 h-4 w-4 text-[var(--primary)]" />
              <div className="space-y-1 text-sm text-[var(--foreground)]">
                <p>
                  <span className="font-medium">Admin:</span> Manage workspace settings and collaborators.
                </p>
                <p>
                  <span className="font-medium">Editor:</span> Create and update projects, prompts, and comments.
                </p>
                <p>
                  <span className="font-medium">Viewer:</span> Read-only access to the workspace.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-[var(--foreground)]">Current Collaborators</h3>
              <span className="text-xs text-[var(--muted-foreground)]">
                {currentCollaborators.length} total
              </span>
            </div>

            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {currentCollaborators.map((collaborator) => (
                <article
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
                  key={collaborator.id}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-medium text-[var(--foreground)]">
                      {initials(collaborator.name) || "U"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--foreground)]">
                        {collaborator.name}
                      </p>
                      <p className="truncate text-xs text-[var(--muted-foreground)]">{collaborator.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {collaborator.role === "owner" ? (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${roleBadgeClass(
                          collaborator.role
                        )}`}
                      >
                        Owner
                      </span>
                    ) : (
                      <select
                        className="rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-xs text-[var(--foreground)] outline-none"
                        onChange={(event) => onRoleChange(collaborator.id, event.target.value)}
                        value={collaborator.role}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}

                    {collaborator.role !== "owner" ? (
                      <button
                        className="rounded-md p-1.5 text-red-600 transition hover:bg-red-600/10"
                        onClick={() => onRemove(collaborator.id)}
                        title="Remove collaborator"
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <div className="flex justify-end border-t border-[var(--border)] px-5 py-3">
          <button
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            onClick={onClose}
            type="button"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
