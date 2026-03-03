import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getCustomer, type CustomerDetail } from "@/lib/adminApi";

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdminCustomerDetailPage() {
  const { orgId = "" } = useParams();
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  async function load(includeExport = false) {
    if (!orgId) return;
    if (!includeExport) setLoading(true);
    setError(null);

    try {
      const payload = await getCustomer(orgId, { export: includeExport });
      if (includeExport && payload.exportData) {
        downloadJson(`customer-${orgId}-export.json`, payload.exportData);
        setMessage("Customer export downloaded.");
      }
      setDetail(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load customer diagnostics.");
    } finally {
      if (!includeExport) setLoading(false);
      setIsExporting(false);
    }
  }

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function handleExport() {
    setIsExporting(true);
    setMessage(null);
    await load(true);
  }

  if (loading) {
    return <div className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">Loading customer details...</div>;
  }

  if (!detail) {
    return (
      <div className="space-y-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <p>{error ?? "Customer not found."}</p>
        <Link className="underline" to="/admin/customers">
          Back to customers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-[#243042]">{detail.organization.name}</h1>
          <p className="mt-1 text-sm text-slate-600">Slug: {detail.organization.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="text-sm text-[#2b66d5] hover:underline" to="/admin/customers">
            Back to Customers
          </Link>
          <button
            className="rounded-md bg-[#2b66d5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={isExporting}
            onClick={() => void handleExport()}
            type="button"
          >
            {isExporting ? "Exporting..." : "Export Org JSON"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <article className="rounded-lg border border-slate-300 bg-white p-4">
          <h2 className="text-lg font-semibold text-[#243042]">Organization Diagnostics</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Model API Configured</p>
              <p className="mt-1 text-lg font-semibold text-slate-800">
                {detail.diagnostics.modelApiConfigured ? "Yes" : "No"}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Provider / Model</p>
              <p className="mt-1 text-sm text-slate-800">
                {detail.diagnostics.modelProvider ?? "-"} / {detail.diagnostics.model ?? "-"}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Last Generation Attempt</p>
              <p className="mt-1 text-sm text-slate-800">
                {detail.diagnostics.lastGenerationAttemptAt
                  ? new Date(detail.diagnostics.lastGenerationAttemptAt).toLocaleString()
                  : "No generation records"}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Approx Storage</p>
              <p className="mt-1 text-lg font-semibold text-slate-800">{detail.diagnostics.approxStorageMb} MB</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Workspace / Room</p>
              <p className="mt-1 text-sm text-slate-800">
                {detail.diagnostics.workspaceCount} / {detail.diagnostics.roomCount}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Projects / Versions</p>
              <p className="mt-1 text-sm text-slate-800">
                {detail.diagnostics.assetCount} / {detail.diagnostics.assetVersionCount}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Comments / Collaborators</p>
              <p className="mt-1 text-sm text-slate-800">
                {detail.diagnostics.commentCount} / {detail.diagnostics.collaboratorCount}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Recent Activity</p>
              <p className="mt-1 text-sm text-slate-800">
                {detail.diagnostics.recentActivityAt
                  ? new Date(detail.diagnostics.recentActivityAt).toLocaleString()
                  : "-"}
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-lg border border-slate-300 bg-white p-4">
          <h2 className="text-lg font-semibold text-[#243042]">Members</h2>
          <div className="mt-3 space-y-2">
            {detail.members.length === 0 ? (
              <p className="text-sm text-slate-500">No members found.</p>
            ) : (
              detail.members.map((member) => (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2" key={member.id}>
                  <p className="text-sm font-medium text-slate-800">{member.displayName ?? member.email ?? member.userId}</p>
                  <p className="text-xs text-slate-600">{member.email ?? "No email"}</p>
                  <p className="text-xs text-slate-500">Role: {member.role}</p>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="rounded-lg border border-slate-300 bg-white p-4">
        <h2 className="text-lg font-semibold text-[#243042]">Recent Tickets</h2>
        <div className="mt-3 space-y-2">
          {detail.tickets.length === 0 ? (
            <p className="text-sm text-slate-500">No tickets for this organization.</p>
          ) : (
            detail.tickets.map((ticket) => (
              <Link
                className="block rounded-md border border-slate-200 bg-slate-50 px-3 py-2 transition hover:border-slate-400"
                key={ticket.id}
                to={`/admin/support/tickets/${ticket.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">{ticket.subject}</p>
                  <span className="text-xs text-slate-500">{new Date(ticket.updatedAt).toLocaleString()}</span>
                </div>
                <p className="text-xs text-slate-600">
                  {ticket.requesterEmail} · {ticket.status} · {ticket.priority}
                </p>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
