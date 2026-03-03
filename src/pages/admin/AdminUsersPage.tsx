import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listUsers, type UserSummary } from "@/lib/adminApi";

export function AdminUsersPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const rows = await listUsers({ q: query, limit: 200 });
      setUsers(rows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 180);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold text-[#243042]">Users</h1>
        <p className="mt-1 text-sm text-slate-500">Find users, inspect memberships, and review support context.</p>
      </header>

      <section className="rounded-lg border border-slate-300 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by email, name, or user id"
            value={query}
          />
          <button
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            onClick={() => void load()}
            type="button"
          >
            Refresh
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="rounded-lg border border-slate-300 bg-[#f8f9fb]">
        {loading ? (
          <div className="px-4 py-6 text-sm text-slate-500">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-slate-300 bg-[#f1f4f8] text-slate-600">
                <tr>
                  <th className="px-4 py-2 font-semibold">User</th>
                  <th className="px-4 py-2 font-semibold">Email</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Memberships</th>
                  <th className="px-4 py-2 font-semibold">Tickets</th>
                  <th className="px-4 py-2 font-semibold">Recent Activity</th>
                  <th className="px-4 py-2 font-semibold">Last Sign In</th>
                </tr>
              </thead>
              <tbody>
                {users.map((entry) => (
                  <tr className="border-b border-slate-200 last:border-b-0" key={entry.id}>
                    <td className="px-4 py-3">
                      <Link className="font-medium text-[#2b66d5] hover:underline" to={`/admin/users/${entry.id}`}>
                        {entry.displayName}
                      </Link>
                      <p className="text-xs text-slate-500">{entry.id}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{entry.email ?? "No email"}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {entry.isSuspended ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          Suspended
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{entry.membershipCount}</td>
                    <td className="px-4 py-3 text-slate-700">{entry.ticketCount}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {entry.recentActivityAt ? new Date(entry.recentActivityAt).toLocaleString() : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {entry.lastSignInAt ? new Date(entry.lastSignInAt).toLocaleString() : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
