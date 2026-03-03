import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getSupportTicket,
  postSupportTicketMessage,
  postSupportTicketNote,
  updateSupportTicket,
  type SupportTicketDetail,
  type TicketPriority,
  type TicketStatus
} from "@/lib/adminApi";
import { useAdminContext } from "@/components/admin/AdminConsoleLayout";

export function AdminTicketDetailPage() {
  const { ticketId = "" } = useParams();
  const { identity } = useAdminContext();
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [savingState, setSavingState] = useState<string | null>(null);

  async function loadDetail() {
    if (!ticketId) return;
    setLoading(true);
    setError(null);

    try {
      const payload = await getSupportTicket(ticketId);
      setDetail(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load ticket.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const assigneeOptions = useMemo(() => {
    if (!detail) return [];
    const unique = new Map<string, { label: string; value: string }>();
    for (const member of detail.organizationMembers) {
      unique.set(member.userId, {
        value: member.userId,
        label: `${member.displayName ?? member.email ?? member.userId} (${member.role})`
      });
    }
    return Array.from(unique.values());
  }, [detail]);

  async function handleReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ticketId || !replyBody.trim()) return;

    setSavingState("reply");
    setError(null);
    setMessage(null);

    try {
      await postSupportTicketMessage(ticketId, { body: replyBody.trim() });
      setReplyBody("");
      setMessage("Reply posted.");
      await loadDetail();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to post reply.");
    } finally {
      setSavingState(null);
    }
  }

  async function handleAddNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ticketId || !noteBody.trim()) return;

    setSavingState("note");
    setError(null);
    setMessage(null);

    try {
      await postSupportTicketNote(ticketId, { body: noteBody.trim() });
      setNoteBody("");
      setMessage("Internal note added.");
      await loadDetail();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add note.");
    } finally {
      setSavingState(null);
    }
  }

  async function handleTicketMetaUpdate(input: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assigneeUserId?: string | null;
  }) {
    if (!ticketId) return;
    setSavingState("meta");
    setError(null);

    try {
      await updateSupportTicket(ticketId, input);
      await loadDetail();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update ticket.");
    } finally {
      setSavingState(null);
    }
  }

  if (loading) {
    return <div className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">Loading ticket...</div>;
  }

  if (!detail) {
    return (
      <div className="space-y-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <p>{error ?? "Ticket not found."}</p>
        <Link className="underline" to="/admin/support">
          Back to support inbox
        </Link>
      </div>
    );
  }

  const { ticket } = detail;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-[#243042]">Ticket #{ticket.id.slice(0, 8)}</h1>
          <p className="mt-1 text-sm text-slate-600">{ticket.subject}</p>
        </div>
        <Link className="text-sm text-[#2b66d5] hover:underline" to="/admin/support">
          Back to Support Inbox
        </Link>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="space-y-4 rounded-lg border border-slate-300 bg-white p-4">
          <h2 className="text-lg font-semibold text-[#243042]">Message Thread</h2>
          <div className="space-y-2">
            {detail.messages.length === 0 ? (
              <p className="text-sm text-slate-500">No messages yet.</p>
            ) : (
              detail.messages.map((entry) => (
                <article
                  className={`rounded-md border px-3 py-2 ${
                    entry.authorType === "admin"
                      ? "border-blue-200 bg-blue-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                  key={entry.id}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>
                      {entry.authorName} · {entry.authorType}
                    </span>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-800">{entry.body}</p>
                </article>
              ))
            )}
          </div>

          <form className="space-y-2" onSubmit={handleReply}>
            <textarea
              className="min-h-[120px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              onChange={(event) => setReplyBody(event.target.value)}
              placeholder="Reply to customer"
              value={replyBody}
            />
            <button
              className="rounded-md bg-[#2b66d5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={savingState === "reply" || !replyBody.trim()}
              type="submit"
            >
              {savingState === "reply" ? "Sending..." : "Send Reply"}
            </button>
          </form>
        </section>

        <section className="space-y-4">
          <article className="rounded-lg border border-slate-300 bg-white p-4">
            <h3 className="text-base font-semibold text-[#243042]">Ticket Metadata</h3>
            <div className="mt-3 space-y-2 text-sm">
              <p>
                <span className="font-medium">Requester:</span> {ticket.requesterEmail}
              </p>
              <p>
                <span className="font-medium">Organization:</span>{" "}
                {ticket.organizationId ? (
                  <Link className="text-[#2b66d5] hover:underline" to={`/admin/customers/${ticket.organizationId}`}>
                    {ticket.organizationName ?? ticket.organizationId}
                  </Link>
                ) : (
                  "-"
                )}
              </p>
              <p>
                <span className="font-medium">Created:</span> {new Date(ticket.createdAt).toLocaleString()}
              </p>
              <p>
                <span className="font-medium">Updated:</span> {new Date(ticket.updatedAt).toLocaleString()}
              </p>
            </div>

            <div className="mt-4 space-y-2">
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
                <select
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  onChange={(event) =>
                    void handleTicketMetaUpdate({ status: event.target.value as TicketStatus })
                  }
                  value={ticket.status}
                >
                  <option value="open">open</option>
                  <option value="pending">pending</option>
                  <option value="solved">solved</option>
                  <option value="closed">closed</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Priority</span>
                <select
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  onChange={(event) =>
                    void handleTicketMetaUpdate({ priority: event.target.value as TicketPriority })
                  }
                  value={ticket.priority}
                >
                  <option value="low">low</option>
                  <option value="normal">normal</option>
                  <option value="high">high</option>
                  <option value="urgent">urgent</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assignee</span>
                <select
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  onChange={(event) =>
                    void handleTicketMetaUpdate({
                      assigneeUserId: event.target.value.length > 0 ? event.target.value : null
                    })
                  }
                  value={ticket.assigneeUserId ?? ""}
                >
                  <option value="">Unassigned</option>
                  {assigneeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                onClick={() => void handleTicketMetaUpdate({ assigneeUserId: identity.userId })}
                type="button"
              >
                Assign to me
              </button>
            </div>
          </article>

          <article className="rounded-lg border border-slate-300 bg-white p-4">
            <h3 className="text-base font-semibold text-[#243042]">Internal Notes</h3>
            <div className="mt-3 space-y-2">
              {detail.internalNotes.length === 0 ? (
                <p className="text-sm text-slate-500">No internal notes yet.</p>
              ) : (
                detail.internalNotes.map((entry) => (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2" key={entry.id}>
                    <div className="mb-1 flex items-center justify-between text-xs text-amber-700">
                      <span>{entry.adminName}</span>
                      <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-amber-900">{entry.body}</p>
                  </div>
                ))
              )}
            </div>

            <form className="mt-3 space-y-2" onSubmit={handleAddNote}>
              <textarea
                className="min-h-[90px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                onChange={(event) => setNoteBody(event.target.value)}
                placeholder="Internal troubleshooting note"
                value={noteBody}
              />
              <button
                className="rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={savingState === "note" || !noteBody.trim()}
                type="submit"
              >
                {savingState === "note" ? "Saving..." : "Add Note"}
              </button>
            </form>
          </article>
        </section>
      </div>
    </div>
  );
}
