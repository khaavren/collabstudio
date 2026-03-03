import { type ComponentType, useEffect, useState } from "react";
import { Activity, Building2, LifeBuoy, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { listAuditEvents, listCustomers, listSupportTickets, listUsers, type SupportTicketSummary } from "@/lib/adminApi";

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: ComponentType<{ className?: string }> }) {
  return (
    <article className="rounded-lg border border-slate-300 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-500" />
      </div>
      <p className="text-3xl font-semibold text-slate-800">{value}</p>
    </article>
  );
}

function TicketRow({ ticket }: { ticket: SupportTicketSummary }) {
  return (
    <Link
      className="block rounded-md border border-slate-200 bg-white px-3 py-2 transition hover:border-slate-400"
      to={`/admin/support/tickets/${ticket.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-slate-800">{ticket.subject}</p>
        <span className="text-xs text-slate-500">{new Date(ticket.updatedAt).toLocaleString()}</span>
      </div>
      <p className="text-xs text-slate-600">
        {ticket.requesterEmail} · {ticket.status} · {ticket.priority}
      </p>
    </Link>
  );
}

export function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openTickets, setOpenTickets] = useState<SupportTicketSummary[]>([]);
  const [pendingTickets, setPendingTickets] = useState<SupportTicketSummary[]>([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [auditCount, setAuditCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [openRows, pendingRows, customers, usersList, events] = await Promise.all([
          listSupportTickets({ status: "open", limit: 25 }),
          listSupportTickets({ status: "pending", limit: 25 }),
          listCustomers({ limit: 200 }),
          listUsers({ limit: 200 }),
          listAuditEvents({ limit: 100 })
        ]);

        if (!active) return;

        setOpenTickets(openRows);
        setPendingTickets(pendingRows);
        setTotalCustomers(customers.length);
        setTotalUsers(usersList.length);
        setAuditCount(events.length);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Unable to load admin dashboard.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold text-[#243042]">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Customer support and troubleshooting command center.</p>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={LifeBuoy} label="Open Tickets" value={openTickets.length} />
        <StatCard icon={Activity} label="Pending Tickets" value={pendingTickets.length} />
        <StatCard icon={Building2} label="Customers" value={totalCustomers} />
        <StatCard icon={Users} label="Users" value={totalUsers} />
        <StatCard icon={ShieldCheck} label="Recent Audit Events" value={auditCount} />
      </section>

      {loading ? (
        <div className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">Loading dashboard data...</div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border border-slate-300 bg-[#f8f9fb] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#243042]">Open Tickets</h2>
            <Link className="text-sm text-[#2b66d5] hover:underline" to="/admin/support">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {openTickets.length === 0 ? (
              <p className="text-sm text-slate-500">No open tickets.</p>
            ) : (
              openTickets.slice(0, 8).map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)
            )}
          </div>
        </article>

        <article className="rounded-lg border border-slate-300 bg-[#f8f9fb] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#243042]">Pending Tickets</h2>
            <Link className="text-sm text-[#2b66d5] hover:underline" to="/admin/support?status=pending">
              Filter pending
            </Link>
          </div>
          <div className="space-y-2">
            {pendingTickets.length === 0 ? (
              <p className="text-sm text-slate-500">No pending tickets.</p>
            ) : (
              pendingTickets.slice(0, 8).map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
