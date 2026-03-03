import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getUserDetail, type UserDetail } from "@/lib/adminApi";

export function AdminUserDetailPage() {
  const { userId = "" } = useParams();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const payload = await getUserDetail(userId);
        if (!active) return;
        setDetail(payload);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Unable to load user diagnostics.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    if (userId) {
      void load();
    }

    return () => {
      active = false;
    };
  }, [userId]);

  if (loading) {
    return <div className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">Loading user details...</div>;
  }

  if (!detail) {
    return (
      <div className="space-y-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <p>{error ?? "User not found."}</p>
        <Link className="underline" to="/admin/users">
          Back to users
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-[#243042]">{detail.user.displayName}</h1>
          <p className="mt-1 text-sm text-slate-600">{detail.user.email ?? "No email"}</p>
        </div>
        <Link className="text-sm text-[#2b66d5] hover:underline" to="/admin/users">
          Back to Users
        </Link>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-lg border border-slate-300 bg-white p-4">
          <h2 className="text-lg font-semibold text-[#243042]">Profile Summary</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p>
              <span className="font-medium">User ID:</span> {detail.user.id}
            </p>
            <p>
              <span className="font-medium">Created:</span>{" "}
              {detail.user.createdAt ? new Date(detail.user.createdAt).toLocaleString() : "-"}
            </p>
            <p>
              <span className="font-medium">Last Sign In:</span>{" "}
              {detail.user.lastSignInAt ? new Date(detail.user.lastSignInAt).toLocaleString() : "Never"}
            </p>
            <p>
              <span className="font-medium">Recent Activity:</span>{" "}
              {detail.recentActivityAt ? new Date(detail.recentActivityAt).toLocaleString() : "-"}
            </p>
          </div>
        </article>

        <article className="rounded-lg border border-slate-300 bg-white p-4">
          <h2 className="text-lg font-semibold text-[#243042]">Memberships</h2>
          <div className="mt-3 space-y-2">
            {detail.memberships.length === 0 ? (
              <p className="text-sm text-slate-500">No organization memberships.</p>
            ) : (
              detail.memberships.map((membership) => (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2" key={membership.id}>
                  <p className="text-sm font-medium text-slate-800">{membership.organizationName ?? membership.organizationId}</p>
                  <p className="text-xs text-slate-600">Role: {membership.role}</p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-lg border border-slate-300 bg-white p-4">
          <h2 className="text-lg font-semibold text-[#243042]">Owned Workspaces</h2>
          <div className="mt-3 space-y-2">
            {detail.workspaces.owned.length === 0 ? (
              <p className="text-sm text-slate-500">No owned workspaces.</p>
            ) : (
              detail.workspaces.owned.map((workspace) => (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2" key={workspace.id}>
                  <p className="text-sm font-medium text-slate-800">{workspace.name}</p>
                  <p className="text-xs text-slate-600">Updated: {new Date(workspace.updatedAt).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-lg border border-slate-300 bg-white p-4">
          <h2 className="text-lg font-semibold text-[#243042]">Associated Tickets</h2>
          <div className="mt-3 space-y-2">
            {detail.tickets.length === 0 ? (
              <p className="text-sm text-slate-500">No support tickets for this user.</p>
            ) : (
              detail.tickets.map((ticket) => (
                <Link
                  className="block rounded-md border border-slate-200 bg-slate-50 px-3 py-2 transition hover:border-slate-400"
                  key={ticket.id}
                  to={`/admin/support/tickets/${ticket.id}`}
                >
                  <p className="text-sm font-medium text-slate-800">{ticket.subject}</p>
                  <p className="text-xs text-slate-600">
                    {ticket.status} · {ticket.priority} · {new Date(ticket.updatedAt).toLocaleString()}
                  </p>
                </Link>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
