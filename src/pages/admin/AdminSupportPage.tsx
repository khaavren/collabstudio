import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { createSupportTicket, listSupportTickets, updateSupportTicket, type SupportTicketSummary, type TicketPriority, type TicketStatus } from "@/lib/adminApi";
import { useAdminContext } from "@/components/admin/AdminConsoleLayout";

const STATUS_OPTIONS: Array<{ label: string; value: TicketStatus | "" }> = [
  { label: "All", value: "" },
  { label: "Open", value: "open" },
  { label: "Pending", value: "pending" },
  { label: "Solved", value: "solved" },
  { label: "Closed", value: "closed" }
];

const PRIORITY_OPTIONS: Array<{ label: string; value: TicketPriority | "" }> = [
  { label: "All", value: "" },
  { label: "Low", value: "low" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" }
];

export function AdminSupportPage() {
  const { identity } = useAdminContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">(
    (searchParams.get("status") as TicketStatus | "") || ""
  );
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "">(
    (searchParams.get("priority") as TicketPriority | "") || ""
  );
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [isSavingRow, setIsSavingRow] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [newPriority, setNewPriority] = useState<TicketPriority>("normal");
  const [newCategory, setNewCategory] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const next = new URLSearchParams();
    if (statusFilter) next.set("status", statusFilter);
    if (priorityFilter) next.set("priority", priorityFilter);
    if (query.trim()) next.set("q", query.trim());
    setSearchParams(next, { replace: true });
  }, [priorityFilter, query, setSearchParams, statusFilter]);

  async function loadTickets() {
    setLoading(true);
    setError(null);

    try {
      const rows = await listSupportTickets({
        status: statusFilter,
        priority: priorityFilter,
        q: query,
        limit: 200
      });
      setTickets(rows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load support tickets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, priorityFilter]);

  const filteredCountText = useMemo(() => `${tickets.length} tickets`, [tickets.length]);

  async function handleCreateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setError(null);
    setMessage(null);

    try {
      await createSupportTicket({
        subject,
        requesterEmail,
        priority: newPriority,
        category: newCategory || null,
        status: "open"
      });

      setSubject("");
      setRequesterEmail("");
      setNewPriority("normal");
      setNewCategory("");
      setMessage("Support ticket created.");
      await loadTickets();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create support ticket.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleAssignToMe(ticket: SupportTicketSummary) {
    setIsSavingRow(ticket.id);
    setError(null);

    try {
      await updateSupportTicket(ticket.id, {
        assigneeUserId: identity.userId
      });
      setTickets((current) =>
        current.map((entry) =>
          entry.id === ticket.id
            ? {
                ...entry,
                assigneeUserId: identity.userId,
                assigneeEmail: identity.email,
                assigneeName: identity.email ?? "Me"
              }
            : entry
        )
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to assign ticket.");
    } finally {
      setIsSavingRow(null);
    }
  }

  async function handleStatusChange(ticket: SupportTicketSummary, status: TicketStatus) {
    setIsSavingRow(ticket.id);
    setError(null);

    try {
      await updateSupportTicket(ticket.id, { status });
      setTickets((current) =>
        current.map((entry) => (entry.id === ticket.id ? { ...entry, status } : entry))
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update ticket status.");
    } finally {
      setIsSavingRow(null);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold text-[#243042]">Support Inbox</h1>
        <p className="mt-1 text-sm text-slate-500">Handle customer requests, assignment, and lifecycle status.</p>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
      ) : null}

      <section className="rounded-lg border border-slate-300 bg-white p-4">
        <h2 className="text-lg font-semibold text-[#243042]">Create Ticket</h2>
        <form className="mt-3 grid gap-2 md:grid-cols-[1.5fr_1fr_0.8fr_1fr_auto]" onSubmit={handleCreateTicket}>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject"
            required
            value={subject}
          />
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setRequesterEmail(event.target.value)}
            placeholder="requester@company.com"
            required
            type="email"
            value={requesterEmail}
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setNewPriority(event.target.value as TicketPriority)}
            value={newPriority}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            onChange={(event) => setNewCategory(event.target.value)}
            placeholder="Category"
            value={newCategory}
          />
          <button
            className="rounded-md bg-[#2b66d5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={isCreating}
            type="submit"
          >
            {isCreating ? "Creating..." : "Create"}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-300 bg-[#f8f9fb]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              onChange={(event) => setStatusFilter(event.target.value as TicketStatus | "")}
              value={statusFilter}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              onChange={(event) => setPriorityFilter(event.target.value as TicketPriority | "")}
              value={priorityFilter}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search subject, requester, ticket id"
              value={query}
            />
            <button
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
              onClick={() => void loadTickets()}
              type="button"
            >
              Search
            </button>
          </div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{filteredCountText}</p>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-sm text-slate-500">Loading support inbox...</div>
        ) : tickets.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">No tickets found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-slate-300 bg-[#f1f4f8] text-slate-600">
                <tr>
                  <th className="px-4 py-2 font-semibold">Ticket</th>
                  <th className="px-4 py-2 font-semibold">Requester</th>
                  <th className="px-4 py-2 font-semibold">Org</th>
                  <th className="px-4 py-2 font-semibold">Priority</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Assignee</th>
                  <th className="px-4 py-2 font-semibold">Updated</th>
                  <th className="px-4 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => {
                  const isSaving = isSavingRow === ticket.id;
                  return (
                    <tr className="border-b border-slate-200 last:border-b-0" key={ticket.id}>
                      <td className="px-4 py-3">
                        <Link className="font-medium text-[#2b66d5] hover:underline" to={`/admin/support/tickets/${ticket.id}`}>
                          #{ticket.id.slice(0, 8)}
                        </Link>
                        <p className="text-slate-700">{ticket.subject}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{ticket.requesterEmail}</td>
                      <td className="px-4 py-3 text-slate-700">{ticket.organizationName ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-700">{ticket.priority}</td>
                      <td className="px-4 py-3">
                        <select
                          className="rounded-md border border-slate-300 bg-white px-2 py-1"
                          disabled={isSaving}
                          onChange={(event) => void handleStatusChange(ticket, event.target.value as TicketStatus)}
                          value={ticket.status}
                        >
                          <option value="open">open</option>
                          <option value="pending">pending</option>
                          <option value="solved">solved</option>
                          <option value="closed">closed</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{ticket.assigneeName ?? ticket.assigneeEmail ?? "Unassigned"}</td>
                      <td className="px-4 py-3 text-slate-700">{new Date(ticket.updatedAt).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <button
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                          disabled={isSaving}
                          onClick={() => void handleAssignToMe(ticket)}
                          type="button"
                        >
                          Assign to me
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
