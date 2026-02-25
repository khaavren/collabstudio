import {
  Clock,
  FolderTree,
  History,
  MessageSquare,
  Plus,
  Sparkles,
  Users
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/context/auth-context";

type Workspace = {
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

type Activity = {
  id: string;
  type: "asset" | "comment" | "room";
  title: string;
  workspace: string;
  action: string;
  time: string;
  user: string;
};

const workspaces: Workspace[] = [
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

const activities: Activity[] = [
  {
    id: "a1",
    type: "asset",
    title: "Hard Hat v3",
    workspace: "Product Development",
    action: "Updated with new iteration",
    time: "2 hours ago",
    user: "John Doe"
  },
  {
    id: "a2",
    type: "comment",
    title: "Safety Vest Design",
    workspace: "Product Development",
    action: "Added comment",
    time: "5 hours ago",
    user: "Jane Smith"
  },
  {
    id: "a3",
    type: "room",
    title: "New Room: Gloves",
    workspace: "Industrial Series",
    action: "Created room",
    time: "1 day ago",
    user: "Mike Johnson"
  }
];

function activityIcon(type: Activity["type"]) {
  if (type === "asset") return History;
  if (type === "comment") return MessageSquare;
  return FolderTree;
}

export function Dashboard() {
  const { logout, user } = useAuth();

  const currentUserId = user?.id ?? "1";
  const currentUserName = user?.name ?? "John Doe";
  const firstName = currentUserName.split(" ")[0] || "there";

  const ownedWorkspaces = workspaces.filter((workspace) => workspace.owner === currentUserId);
  const sharedWorkspaces = workspaces.filter((workspace) => workspace.owner !== currentUserId);

  const totalRooms = workspaces.reduce((sum, workspace) => sum + workspace.roomCount, 0);

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
      value: 8,
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
            <button
              className="text-sm text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
              onClick={logout}
              type="button"
            >
              Logout
            </button>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--muted)] text-xs font-medium text-[var(--foreground)]">
                {user?.initials ?? "JD"}
              </span>
              <span className="text-sm text-[var(--foreground)]">{currentUserName}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="site-shell space-y-10 px-6 py-10">
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
              type="button"
            >
              <Plus className="h-5 w-5" />
              New Workspace
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ownedWorkspaces.map((workspace) => (
              <Link
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--primary)] hover:shadow-sm"
                key={workspace.id}
                to={`/workspace/${workspace.id}/room/hard-hat-system`}
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
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {workspace.lastAccessed}
                  </span>
                </div>
              </Link>
            ))}

            <button
              className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-5 text-center transition hover:border-[var(--primary)]"
              type="button"
            >
              <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--primary)]">
                <Plus className="h-5 w-5" />
              </span>
              <p className="text-xl font-semibold tracking-tight">Create New Workspace</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">Start a new project</p>
            </button>
          </div>
        </section>

        {sharedWorkspaces.length > 0 ? (
          <section>
            <div className="mb-4">
              <h2 className="text-4xl font-semibold tracking-tight">Shared Workspaces</h2>
              <p className="mt-1 text-lg text-[var(--muted-foreground)]">
                Workspaces shared with you by other team members
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sharedWorkspaces.map((workspace) => (
                <Link
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--primary)] hover:shadow-sm"
                  key={workspace.id}
                  to={`/workspace/${workspace.id}/room/hard-hat-system`}
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
          </section>
        ) : null}

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
            {activities.map((activity, index) => {
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
            })}
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
    </div>
  );
}
