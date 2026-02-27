import {
  ChevronDown,
  Clock,
  FolderTree,
  History,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  Sparkles,
  UserCircle2,
  UserPlus,
  Users
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/context/auth-context";
import { InviteCollaboratorsModal } from "../components/invite-collaborators-modal";
import { EditWorkspaceModal } from "@/components/EditWorkspaceModal";
import {
  createWorkspaceForUser,
  deleteWorkspaceById,
  fetchWorkspacesForUser,
  inviteWorkspaceCollaborator,
  removeWorkspaceCollaborator,
  updateWorkspaceById,
  updateWorkspaceCollaboratorRole,
  type WorkspaceRecord
} from "@/lib/workspaces";

type Activity = {
  id: string;
  type: "asset" | "comment" | "room";
  title: string;
  workspace: string;
  action: string;
  time: string;
  user: string;
};

const activities: Activity[] = [];

function activityIcon(type: Activity["type"]) {
  if (type === "asset") return History;
  if (type === "comment") return MessageSquare;
  return FolderTree;
}

export function Dashboard() {
  const { logout, user } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [editingWorkspace, setEditingWorkspace] = useState<WorkspaceRecord | null>(null);
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(null);
  const [invitingCollaboratorsWorkspace, setInvitingCollaboratorsWorkspace] =
    useState<WorkspaceRecord | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);

  const currentUserId = user?.id ?? "";
  const currentUserName = user?.name?.trim() || (user?.email ? user.email.split("@")[0] : "Member");
  const firstName = currentUserName.split(" ")[0] || "there";

  const ownedWorkspaces = workspaces.filter((workspace) => workspace.owner === currentUserId);
  const sharedWorkspaces = workspaces.filter((workspace) => workspace.owner !== currentUserId);
  const activeInvitingWorkspace =
    invitingCollaboratorsWorkspace !== null
      ? workspaces.find((workspace) => workspace.id === invitingCollaboratorsWorkspace.id) ?? null
      : null;

  const totalRooms = workspaces.reduce((sum, workspace) => sum + workspace.roomCount, 0);
  const totalTeamMembers = useMemo(() => {
    const unique = new Set<string>();
    workspaces.forEach((workspace) => {
      workspace.collaboratorsList.forEach((collaborator) => {
        const key = collaborator.email.trim().toLowerCase() || collaborator.id;
        if (key) unique.add(key);
      });
    });
    return unique.size;
  }, [workspaces]);

  const stats = [
    {
      label: "Workspaces",
      value: workspaces.length,
      icon: FolderTree
    },
    {
      label: "Total Rooms",
      value: totalRooms,
      icon: FolderTree
    },
    {
      label: "Team Members",
      value: totalTeamMembers,
      icon: Users
    },
    {
      label: "Recent Activity",
      value: activities.length,
      icon: Clock
    }
  ];

  const quickActions = [
    {
      title: "Getting Started Guide",
      description: "Learn the basics of MagisterLudi",
      icon: Sparkles
    },
    {
      title: "Invite Team Members",
      description: "Collaborate with your team",
      icon: Users
    },
    {
      title: "AI Integration Guide",
      description: "Connect your preferred AI platform",
      icon: MessageSquare
    }
  ];

  useEffect(() => {
    let active = true;

    async function load() {
      if (!user?.id) {
        if (!active) return;
        setWorkspaces([]);
        setIsLoadingWorkspaces(false);
        setError(null);
        return;
      }

      setIsLoadingWorkspaces(true);
      try {
        const data = await fetchWorkspacesForUser({
          userId: user.id,
          email: user.email ?? null
        });
        if (!active) return;
        setWorkspaces(data);
        setError(null);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Unable to load workspaces.");
      } finally {
        if (!active) return;
        setIsLoadingWorkspaces(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [user?.email, user?.id]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function handleSaveWorkspace(next: { name: string; description: string }) {
    if (!editingWorkspace) return;

    void (async () => {
      try {
        if (pendingWorkspaceId === editingWorkspace.id) {
          if (!user?.id || !user?.email) {
            throw new Error("Sign in with an email account to create a workspace.");
          }
          await createWorkspaceForUser({
            ownerId: user.id,
            ownerName: currentUserName,
            ownerEmail: user.email,
            name: next.name,
            description: next.description,
            color: "var(--primary)"
          });
          setPendingWorkspaceId(null);
        } else {
          await updateWorkspaceById(editingWorkspace.id, next);
        }

        const data = await fetchWorkspacesForUser({
          userId: user?.id ?? "",
          email: user?.email ?? null
        });
        setWorkspaces(data);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to save workspace.");
      }
    })();
  }

  function handleDeleteWorkspace() {
    if (!editingWorkspace) return;

    if (pendingWorkspaceId === editingWorkspace.id) {
      setPendingWorkspaceId(null);
      setEditingWorkspace(null);
      return;
    }

    const confirmed = window.confirm(
      `Delete workspace "${editingWorkspace.name}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    void (async () => {
      try {
        await deleteWorkspaceById(editingWorkspace.id);
        const data = await fetchWorkspacesForUser({
          userId: user?.id ?? "",
          email: user?.email ?? null
        });
        setWorkspaces(data);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to delete workspace.");
      } finally {
        setEditingWorkspace(null);
      }
    })();
  }

  function handleCloseEditWorkspace() {
    if (editingWorkspace && pendingWorkspaceId === editingWorkspace.id) {
      setPendingWorkspaceId(null);
    }
    setEditingWorkspace(null);
  }

  function handleCreateWorkspace() {
    if (!currentUserId) return;
    const nowId = Date.now().toString();
    const newWorkspace: WorkspaceRecord = {
      id: nowId,
      name: "",
      description: "",
      roomCount: 0,
      defaultRoomSlug: null,
      lastAccessed: "Just now",
      collaborators: 1,
      collaboratorsList: [
        {
          id: currentUserId,
          name: currentUserName,
          email: user?.email ?? "",
          role: "owner"
        }
      ],
      color: "var(--primary)",
      owner: currentUserId,
      ownerName: currentUserName
    };

    setPendingWorkspaceId(nowId);
    setEditingWorkspace(newWorkspace);
  }

  function handleInviteCollaborator(email: string, role: string) {
    if (!activeInvitingWorkspace) return;

    const normalizedRole = role === "admin" || role === "editor" || role === "viewer" ? role : "viewer";
    void (async () => {
      try {
        await inviteWorkspaceCollaborator(activeInvitingWorkspace.id, email, normalizedRole);
        const data = await fetchWorkspacesForUser({
          userId: user?.id ?? "",
          email: user?.email ?? null
        });
        setWorkspaces(data);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to invite collaborator.");
      }
    })();
  }

  function handleRemoveCollaborator(collaboratorId: string) {
    if (!activeInvitingWorkspace) return;

    void (async () => {
      try {
        await removeWorkspaceCollaborator(collaboratorId);
        const data = await fetchWorkspacesForUser({
          userId: user?.id ?? "",
          email: user?.email ?? null
        });
        setWorkspaces(data);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to remove collaborator.");
      }
    })();
  }

  function handleRoleChange(collaboratorId: string, newRole: string) {
    if (!activeInvitingWorkspace) return;
    if (newRole !== "admin" && newRole !== "editor" && newRole !== "viewer") return;

    void (async () => {
      try {
        await updateWorkspaceCollaboratorRole(collaboratorId, newRole);
        const data = await fetchWorkspacesForUser({
          userId: user?.id ?? "",
          email: user?.email ?? null
        });
        setWorkspaces(data);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to update role.");
      }
    })();
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="site-shell flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary)] text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="text-2xl font-semibold tracking-tight">MagisterLudi</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative" ref={menuRef}>
              <button
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-1.5 py-1 text-[var(--muted-foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                onClick={() => setMenuOpen((current) => !current)}
                type="button"
              >
                {user?.avatarUrl ? (
                  <img alt={currentUserName} className="h-7 w-7 rounded-full object-cover" src={user.avatarUrl} />
                ) : (
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-medium text-[var(--foreground)]">
                    {user?.initials ?? "U"}
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>

              {menuOpen ? (
                <div
                  className="absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-sm"
                  role="menu"
                >
                  <div className="mb-1 rounded-md px-2 py-1.5 text-xs text-[var(--muted-foreground)]">
                    {currentUserName}
                  </div>
                  <Link
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--accent)]"
                    onClick={() => setMenuOpen(false)}
                    role="menuitem"
                    to="/settings/profile"
                  >
                    <UserCircle2 className="h-4 w-4" />
                    Profile
                  </Link>
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--accent)]"
                    onClick={() => {
                      void logout();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="site-shell space-y-10 px-6 py-10">
        {error ? (
          <div className="rounded-lg border border-[#e8cfc6] bg-[#fff4f0] px-4 py-2 text-sm text-[#9d4d3d]">
            {error}
          </div>
        ) : null}
        <section>
          <h1 className="text-5xl font-semibold tracking-tight">Welcome back, {firstName}</h1>
          <p className="mt-2 text-2xl text-[var(--muted-foreground)]">
            Continue building with your favorite AI platform
          </p>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <article
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
              key={stat.label}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm text-[var(--muted-foreground)]">{stat.label}</p>
                <stat.icon className="h-4 w-4 text-[var(--primary)]" />
              </div>
              <p className="text-5xl font-semibold tracking-tight">{stat.value}</p>
            </article>
          ))}
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-4xl font-semibold tracking-tight">Your Workspaces</h2>
              <p className="mt-1 text-lg text-[var(--muted-foreground)]">
                Workspaces you own and manage
              </p>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-3 text-xl font-medium text-white transition hover:opacity-90"
              onClick={handleCreateWorkspace}
              type="button"
            >
              <Plus className="h-5 w-5" />
              New Workspace
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ownedWorkspaces.map((workspace) => (
              <Link
                className="group relative rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--primary)] hover:shadow-sm"
                key={workspace.id}
                to={`/workspace/${workspace.id}/room/${workspace.defaultRoomSlug ?? "new-room"}`}
              >
                <button
                  className="absolute right-16 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] opacity-0 shadow-sm transition hover:bg-[var(--accent)] hover:text-[var(--foreground)] group-hover:opacity-100"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setEditingWorkspace(workspace);
                  }}
                  title="Edit workspace"
                  type="button"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] opacity-0 shadow-sm transition hover:bg-[var(--accent)] hover:text-[var(--foreground)] group-hover:opacity-100"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setInvitingCollaboratorsWorkspace(workspace);
                  }}
                  title="Invite collaborators"
                  type="button"
                >
                  <UserPlus className="h-4 w-4" />
                </button>

                <div
                  className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: workspace.color }}
                >
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight">{workspace.name}</h3>
                <p className="mt-1 text-lg text-[var(--muted-foreground)]">{workspace.description}</p>

                <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm text-[var(--muted-foreground)]">
                  <div className="flex items-center gap-4">
                    <span className="inline-flex items-center gap-1">
                      <FolderTree className="h-3.5 w-3.5" />
                      {workspace.roomCount} Rooms
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {workspace.collaborators}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {workspace.lastAccessed}
                  </span>
                </div>
              </Link>
            ))}

            {!isLoadingWorkspaces ? (
              <button
                className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-5 text-center transition hover:border-[var(--primary)]"
                onClick={handleCreateWorkspace}
                type="button"
              >
                <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--primary)]">
                  <Plus className="h-5 w-5" />
                </span>
                <p className="text-xl font-semibold tracking-tight">Create New Workspace</p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">Start a new project</p>
              </button>
            ) : null}
          </div>
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-4xl font-semibold tracking-tight">Shared Workspaces</h2>
            <p className="mt-1 text-lg text-[var(--muted-foreground)]">
              Workspaces shared with you by other team members
            </p>
          </div>

          {sharedWorkspaces.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sharedWorkspaces.map((workspace) => (
                <Link
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--primary)] hover:shadow-sm"
                  key={workspace.id}
                  to={`/workspace/${workspace.id}/room/${workspace.defaultRoomSlug ?? "new-room"}`}
                >
                  <div
                    className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: workspace.color }}
                  >
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight">{workspace.name}</h3>
                  <p className="mt-1 text-lg text-[var(--muted-foreground)]">{workspace.description}</p>

                  <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm text-[var(--muted-foreground)]">
                    <div className="flex items-center gap-4">
                      <span className="inline-flex items-center gap-1">
                        <FolderTree className="h-3.5 w-3.5" />
                        {workspace.roomCount} Rooms
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {workspace.collaborators}
                      </span>
                    </div>
                    <span>Owner: {workspace.ownerName}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-[var(--muted-foreground)]">
              No shared workspaces have been shared with you.
            </div>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-4xl font-semibold tracking-tight">Recent Activity</h2>
              <p className="mt-1 text-lg text-[var(--muted-foreground)]">Stay up to date with your team</p>
            </div>
            <button
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--accent)]"
              type="button"
            >
              View All
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {activities.length > 0 ? (
              activities.map((activity, index) => {
                const Icon = activityIcon(activity.type);
                return (
                  <article
                    className={`flex items-start justify-between gap-3 px-4 py-4 ${
                      index < activities.length - 1 ? "border-b border-[var(--border)]" : ""
                    }`}
                    key={activity.id}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--primary)]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-base font-medium text-[var(--foreground)]">{activity.title}</p>
                        <p className="text-sm text-[var(--muted-foreground)]">
                          {activity.user} {activity.action}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)]">{activity.workspace}</p>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)]">{activity.time}</p>
                  </article>
                );
              })
            ) : (
              <div className="px-4 py-6 text-sm text-[var(--muted-foreground)]">
                No recent activity yet.
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-4xl font-semibold tracking-tight">Quick Actions</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {quickActions.map((action) => (
              <button
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:border-[var(--primary)]"
                key={action.title}
                type="button"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--primary)]">
                  <action.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-base font-medium text-[var(--foreground)]">{action.title}</span>
                  <span className="block text-sm text-[var(--muted-foreground)]">{action.description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>

      <EditWorkspaceModal
        isOpen={editingWorkspace !== null}
        onClose={handleCloseEditWorkspace}
        onDelete={handleDeleteWorkspace}
        onSave={handleSaveWorkspace}
        workspaceDescription={editingWorkspace?.description ?? ""}
        workspaceName={editingWorkspace?.name ?? ""}
      />

      {activeInvitingWorkspace ? (
        <InviteCollaboratorsModal
          currentCollaborators={activeInvitingWorkspace.collaboratorsList}
          onClose={() => setInvitingCollaboratorsWorkspace(null)}
          onInvite={handleInviteCollaborator}
          onRemove={handleRemoveCollaborator}
          onRoleChange={handleRoleChange}
          workspaceId={activeInvitingWorkspace.id}
          workspaceName={activeInvitingWorkspace.name}
        />
      ) : null}
    </div>
  );
}
