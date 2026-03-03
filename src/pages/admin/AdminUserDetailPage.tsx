import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteUserAccount, getUserDetail, setUserSuspended, type UserDetail } from "@/lib/adminApi";

export function AdminUserDetailPage() {
  const { userId = "" } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionState, setActionState] = useState<"suspend" | "delete" | null>(null);

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

  async function handleSuspendToggle() {
    if (!detail) return;

    const nextSuspended = !detail.user.isSuspended;
    const confirmed = window.confirm(
      nextSuspended
        ? "Suspend this user account? They will be blocked from signing in."
        : "Unsuspend this user account?"
    );
    if (!confirmed) return;

    setActionState("suspend");
    setError(null);
    setMessage(null);

    try {
      const result = await setUserSuspended(detail.user.id, nextSuspended);
      const payload = await getUserDetail(detail.user.id);
      setDetail(payload);
      setMessage(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update user suspension.");
    } finally {
      setActionState(null);
    }
  }

  async function handleDeleteUser() {
    if (!detail) return;

    const confirmed = window.confirm(
      "Delete this user account permanently? This cannot be undone."
    );
    if (!confirmed) return;

    setActionState("delete");
    setError(null);
    setMessage(null);

    try {
      const result = await deleteUserAccount(detail.user.id);
      navigate("/admin/users", { replace: true });
      window.alert(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete user.");
      setActionState(null);
    }
  }

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
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
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
              <span className="font-medium">Suspension:</span>{" "}
              {detail.user.isSuspended
                ? `Suspended until ${detail.user.suspendedUntil ? new Date(detail.user.suspendedUntil).toLocaleString() : "future date"}`
                : "Active"}
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

      <section className="rounded-lg border border-slate-300 bg-white p-4">
        <h2 className="text-lg font-semibold text-[#243042]">User Controls</h2>
        <p className="mt-1 text-sm text-slate-500">Manually suspend/unsuspend or permanently delete the account.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
              detail.user.isSuspended ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"
            }`}
            disabled={actionState !== null}
            onClick={() => void handleSuspendToggle()}
            type="button"
          >
            {actionState === "suspend"
              ? "Saving..."
              : detail.user.isSuspended
                ? "Unsuspend User"
                : "Suspend User"}
          </button>
          <button
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            disabled={actionState !== null}
            onClick={() => void handleDeleteUser()}
            type="button"
          >
            {actionState === "delete" ? "Deleting..." : "Delete User"}
          </button>
        </div>
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
