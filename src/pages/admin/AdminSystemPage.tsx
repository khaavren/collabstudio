import { useEffect, useState } from "react";
import { getSystemHealth, type SystemHealth } from "@/lib/adminApi";

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
        ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
      }`}
    >
      {ok ? "OK" : "Issue"}
    </span>
  );
}

export function AdminSystemPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const payload = await getSystemHealth();
      setHealth(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load system health.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-[#243042]">System Health</h1>
          <p className="mt-1 text-sm text-slate-500">Runtime checks for connectivity, storage, realtime baseline, and env configuration.</p>
        </div>
        <button
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          onClick={() => void load()}
          type="button"
        >
          Refresh
        </button>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">Checking system health...</div>
      ) : null}

      {health ? (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-lg border border-slate-300 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Supabase Connectivity</p>
                <StatusBadge ok={health.checks.supabaseConnected} />
              </div>
              <p className="text-xs text-slate-500">Read access to core tables through service-role admin client.</p>
            </article>
            <article className="rounded-lg border border-slate-300 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Storage Bucket Access</p>
                <StatusBadge ok={health.checks.storageBucketConnected} />
              </div>
              <p className="text-xs text-slate-500">Bucket lookup for `bandjoes-assets`.</p>
            </article>
            <article className="rounded-lg border border-slate-300 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Realtime Baseline</p>
                <StatusBadge ok={health.checks.realtimeBasicCheck} />
              </div>
              <p className="text-xs text-slate-500">Baseline query for realtime-backed tables.</p>
            </article>
          </section>

          <section className="rounded-lg border border-slate-300 bg-white p-4">
            <h2 className="text-lg font-semibold text-[#243042]">Environment Variable Presence</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(health.env).map(([name, present]) => (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2" key={name}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{name}</p>
                    <StatusBadge ok={present} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-300 bg-white p-4">
            <h2 className="text-lg font-semibold text-[#243042]">Check Output</h2>
            <p className="mt-1 text-sm text-slate-500">Checked at: {new Date(health.checkedAt).toLocaleString()}</p>
            <div className="mt-3 space-y-2">
              {health.errors.length === 0 ? (
                <p className="text-sm text-emerald-700">No errors reported.</p>
              ) : (
                health.errors.map((entry, index) => (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" key={index}>
                    {entry}
                  </p>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
