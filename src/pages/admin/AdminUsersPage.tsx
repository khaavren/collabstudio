import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createUserAccount, listUsers, type UserSummary } from "@/lib/adminApi";

type CreateUserModalProps = {
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  setDisplayName: (value: string) => void;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  values: {
    displayName: string;
    email: string;
    password: string;
  };
};

function CreateUserModal({
  error,
  isSubmitting,
  onClose,
  onSubmit,
  setDisplayName,
  setEmail,
  setPassword,
  values
}: CreateUserModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-300 bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-[#243042]">Add User</h2>
            <p className="mt-1 text-sm text-slate-500">
              Create a user account manually with an email login and password.
            </p>
          </div>
          <button
            className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </header>

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-slate-700">
            Full name
            <input
              autoFocus
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Jane Doe"
              value={values.displayName}
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jane@company.com"
              type="email"
              value={values.email}
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              type="password"
              value={values.password}
            />
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-[#2b66d5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2458bc] disabled:opacity-60"
              disabled={
                isSubmitting ||
                !values.displayName.trim() ||
                !values.email.trim() ||
                values.password.trim().length < 8
              }
              type="submit"
            >
              {isSubmitting ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AdminUsersPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function load(nextQuery = query) {
    setLoading(true);
    setError(null);

    try {
      const rows = await listUsers({ q: nextQuery, limit: 200 });
      setUsers(rows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(query);
    }, 180);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setMessage(null);
    setIsCreating(true);

    try {
      const result = await createUserAccount({
        displayName: createDisplayName.trim(),
        email: createEmail.trim(),
        password: createPassword
      });
      setCreateDisplayName("");
      setCreateEmail("");
      setCreatePassword("");
      setIsCreateOpen(false);
      setQuery("");
      setMessage(result.message);
      await load("");
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : "Unable to create user.");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-[#243042]">Users</h1>
          <p className="mt-1 text-sm text-slate-500">Find users, inspect memberships, and review support context.</p>
        </div>
        <button
          className="rounded-md bg-[#2b66d5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2458bc]"
          onClick={() => {
            setCreateError(null);
            setIsCreateOpen(true);
          }}
          type="button"
        >
          Add User
        </button>
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
            onClick={() => void load(query)}
            type="button"
          >
            Refresh
          </button>
        </div>
      </section>

      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}
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

      {isCreateOpen ? (
        <CreateUserModal
          error={createError}
          isSubmitting={isCreating}
          onClose={() => {
            if (isCreating) return;
            setIsCreateOpen(false);
          }}
          onSubmit={(event) => void handleCreateUser(event)}
          setDisplayName={setCreateDisplayName}
          setEmail={setCreateEmail}
          setPassword={setCreatePassword}
          values={{
            displayName: createDisplayName,
            email: createEmail,
            password: createPassword
          }}
        />
      ) : null}
    </div>
  );
}
