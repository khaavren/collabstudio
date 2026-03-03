import { FormEvent, useEffect, useState } from "react";
import { listAuditEvents, type AuditEvent } from "@/lib/adminApi";

export function AdminAuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [orgId, setOrgId] = useState("");
  const [action, setAction] = useState("");
  const [since, setSince] = useState("");

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const rows = await listAuditEvents({
        q: query,
        orgId,
        action,
        since: since || undefined,
        limit: 300
      });
      setEvents(rows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load audit events.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load();
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold text-[#243042]">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500">Trace admin actions across tickets, users, and customers.</p>
      </header>

      <section className="rounded-lg border border-slate-300 bg-white p-4">
        <form className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto]" onSubmit={handleFilter}>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search text"
            value={query}
          />
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setOrgId(event.target.value)}
            placeholder="Organization ID"
            value={orgId}
          />
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setAction(event.target.value)}
            placeholder="Action (e.g. support.ticket.updated)"
            value={action}
          />
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setSince(event.target.value)}
            placeholder="Since (ISO date)"
            value={since}
          />
          <button className="rounded-md bg-[#2b66d5] px-4 py-2 text-sm font-semibold text-white" type="submit">
            Apply
          </button>
        </form>
      </section>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="rounded-lg border border-slate-300 bg-[#f8f9fb]">
        {loading ? (
          <div className="px-4 py-6 text-sm text-slate-500">Loading audit events...</div>
        ) : events.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">No audit events found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-b border-slate-300 bg-[#f1f4f8] text-slate-600">
                <tr>
                  <th className="px-4 py-2 font-semibold">Timestamp</th>
                  <th className="px-4 py-2 font-semibold">Actor</th>
                  <th className="px-4 py-2 font-semibold">Action</th>
                  <th className="px-4 py-2 font-semibold">Target</th>
                  <th className="px-4 py-2 font-semibold">Organization</th>
                  <th className="px-4 py-2 font-semibold">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr className="border-b border-slate-200 last:border-b-0" key={event.id}>
                    <td className="px-4 py-3 text-slate-700">{new Date(event.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-700">{event.actor_email ?? event.actor_user_id ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{event.action}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {event.target_type ?? "-"} {event.target_id ? `· ${event.target_id}` : ""}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{event.organization_id ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <pre className="max-w-[320px] whitespace-pre-wrap break-words">{JSON.stringify(event.metadata ?? {})}</pre>
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
