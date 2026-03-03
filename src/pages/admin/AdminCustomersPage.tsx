import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listCustomers, type CustomerSummary } from "@/lib/adminApi";

export function AdminCustomersPage() {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const rows = await listCustomers({ q: query, limit: 200 });
      setCustomers(rows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load customers.");
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
        <h1 className="text-3xl font-semibold text-[#243042]">Customers</h1>
        <p className="mt-1 text-sm text-slate-500">Organization lookup and troubleshooting diagnostics.</p>
      </header>

      <section className="rounded-lg border border-slate-300 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by org name, slug, or contact email"
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
          <div className="px-4 py-6 text-sm text-slate-500">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">No customers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-slate-300 bg-[#f1f4f8] text-slate-600">
                <tr>
                  <th className="px-4 py-2 font-semibold">Organization</th>
                  <th className="px-4 py-2 font-semibold">Contact</th>
                  <th className="px-4 py-2 font-semibold">Members</th>
                  <th className="px-4 py-2 font-semibold">Workspaces</th>
                  <th className="px-4 py-2 font-semibold">Open Tickets</th>
                  <th className="px-4 py-2 font-semibold">Model Configured</th>
                  <th className="px-4 py-2 font-semibold">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr className="border-b border-slate-200 last:border-b-0" key={customer.id}>
                    <td className="px-4 py-3">
                      <Link className="font-medium text-[#2b66d5] hover:underline" to={`/admin/customers/${customer.id}`}>
                        {customer.name}
                      </Link>
                      <p className="text-xs text-slate-500">{customer.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{customer.contactEmail ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{customer.memberCount}</td>
                    <td className="px-4 py-3 text-slate-700">{customer.workspaceCount}</td>
                    <td className="px-4 py-3 text-slate-700">{customer.openTicketCount}</td>
                    <td className="px-4 py-3 text-slate-700">{customer.modelConfigured ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {customer.lastActivityAt ? new Date(customer.lastActivityAt).toLocaleString() : "-"}
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
