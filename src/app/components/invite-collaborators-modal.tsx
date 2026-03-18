import { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Mail, Shield, Trash2, UserPlus, X } from "lucide-react";
import { searchWorkspaceUsers, type WorkspaceUserOption } from "@/lib/workspaces";

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
  onInvite: (
    identity: string,
    role: string
  ) => Promise<{ message?: string; inviteUrl?: string | null; emailed?: boolean } | void>;
  onRemove: (collaboratorId: string) => Promise<string | void>;
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
  const [identity, setIdentity] = useState("");
  const [role, setRole] = useState<"viewer" | "editor" | "admin">("viewer");
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
    inviteUrl?: string | null;
    emailed?: boolean;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [matchedUsers, setMatchedUsers] = useState<WorkspaceUserOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<WorkspaceUserOption | null>(null);

  useEffect(() => {
    setIdentity("");
    setRole("viewer");
    setStatus(null);
    setMatchedUsers([]);
    setSelectedUser(null);
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
  const normalizedIdentity = identity.trim().toLowerCase();
  const looksLikeEmail = normalizedIdentity.includes("@");
  const showUserPicker = !looksLikeEmail && normalizedIdentity.length >= 2 && !selectedUser;

  useEffect(() => {
    if (looksLikeEmail || normalizedIdentity.length < 2 || selectedUser) {
      setMatchedUsers([]);
      setIsSearching(false);
      return;
    }

    let active = true;
    setIsSearching(true);

    const timer = window.setTimeout(() => {
      void searchWorkspaceUsers(workspaceId, normalizedIdentity)
        .then((results) => {
          if (!active) return;
          setMatchedUsers(results.filter((entry) => !collaboratorEmails.has(entry.email.toLowerCase())));
        })
        .catch(() => {
          if (!active) return;
          setMatchedUsers([]);
        })
        .finally(() => {
          if (!active) return;
          setIsSearching(false);
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [collaboratorEmails, looksLikeEmail, normalizedIdentity, selectedUser, workspaceId]);

  async function handleInvite() {
    const resolvedIdentity = selectedUser?.email ?? normalizedIdentity;
    const resolvedLooksLikeEmail = resolvedIdentity.includes("@");

    if (!resolvedIdentity) {
      setStatus({ type: "error", message: "Enter an email or invite name." });
      return;
    }

    if (resolvedLooksLikeEmail && !EMAIL_REGEX.test(resolvedIdentity)) {
      setStatus({ type: "error", message: "Enter a valid email address." });
      return;
    }

    if (resolvedLooksLikeEmail && collaboratorEmails.has(resolvedIdentity)) {
      setStatus({ type: "error", message: "This collaborator is already in the workspace." });
      return;
    }

    if (!resolvedLooksLikeEmail && !selectedUser) {
      setStatus({ type: "error", message: "Select a user from the list or enter their email address." });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onInvite(resolvedIdentity, role);
      setIdentity("");
      setRole("viewer");
      setMatchedUsers([]);
      setSelectedUser(null);
      setStatus({
        type: "success",
        message: result?.message ?? "Invitation sent.",
        inviteUrl: result?.inviteUrl ?? null,
        emailed: result?.emailed === true
      });
    } catch (caught) {
      setStatus({
        type: "error",
        message: caught instanceof Error ? caught.message : "Unable to send invitation."
      });
    } finally {
      setIsSubmitting(false);
    }
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
            <h3 className="text-sm font-medium text-[var(--foreground)]">Invite by email or user name</h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px_auto]">
              <label className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                <input
                  className="w-full rounded-lg border border-[var(--border)] bg-white py-2.5 pl-9 pr-3 text-sm text-[var(--foreground)] outline-none"
                  onChange={(event) => {
                    setIdentity(event.target.value);
                    setSelectedUser(null);
                    setStatus(null);
                  }}
                  placeholder="name@company.com or Tin Hoang"
                  type="text"
                  value={identity}
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
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                disabled={isSubmitting}
                onClick={() => void handleInvite()}
                type="button"
              >
                <UserPlus className="h-4 w-4" />
                {isSubmitting ? "Sending..." : "Send Invitation"}
              </button>
            </div>
            {showUserPicker ? (
              <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-sm">
                {isSearching ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--muted-foreground)]">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Searching users...
                  </div>
                ) : matchedUsers.length > 0 ? (
                  matchedUsers.map((user) => (
                    <button
                      className="flex w-full items-center justify-between gap-3 border-t border-[var(--border)] px-3 py-2 text-left transition first:border-t-0 hover:bg-[var(--accent)]"
                      key={user.id}
                      onClick={() => {
                        setIdentity(user.displayName);
                        setSelectedUser(user);
                        setMatchedUsers([]);
                        setStatus(null);
                      }}
                      type="button"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--foreground)]">{user.displayName}</p>
                        <p className="truncate text-xs text-[var(--muted-foreground)]">
                          {user.email}
                          {user.inviteName ? ` · ${user.inviteName}` : ""}
                        </p>
                      </div>
                      <Check className="h-4 w-4 text-transparent" />
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-[var(--muted-foreground)]">
                    No matching users. Enter their email to invite them directly.
                  </div>
                )}
              </div>
            ) : null}
            <p className="text-xs text-[var(--muted-foreground)]">
              Start typing a teammate name to pick from matches, or enter an email directly.
            </p>
            {selectedUser ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--accent)] px-3 py-2 text-sm text-[var(--foreground)]">
                Inviting <span className="font-medium">{selectedUser.displayName}</span> at{" "}
                <span className="text-[var(--muted-foreground)]">{selectedUser.email}</span>
              </div>
            ) : null}
            {status ? (
              <div className="space-y-2">
                <p
                  className={`text-sm ${
                    status.type === "success" ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {status.message}
                </p>
                {status.type === "success" && status.inviteUrl && !status.emailed ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--accent)] p-3 md:flex-row md:items-center">
                    <input
                      className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
                      readOnly
                      value={status.inviteUrl}
                    />
                    <button
                      className="rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
                      onClick={() => {
                        void navigator.clipboard.writeText(status.inviteUrl ?? "");
                      }}
                      type="button"
                    >
                      Copy Link
                    </button>
                  </div>
                ) : null}
              </div>
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
                        className="rounded-md p-1.5 text-red-600 transition hover:bg-red-600/10 disabled:opacity-60"
                        disabled={isSubmitting}
                        onClick={() => {
                          setIsSubmitting(true);
                          void onRemove(collaborator.id)
                            .then((message) => {
                              setStatus({ type: "success", message: message ?? "Collaborator removed." });
                            })
                            .catch((caught) => {
                              setStatus({
                                type: "error",
                                message:
                                  caught instanceof Error
                                    ? caught.message
                                    : "Unable to remove collaborator."
                              });
                            })
                            .finally(() => {
                              setIsSubmitting(false);
                            });
                        }}
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
