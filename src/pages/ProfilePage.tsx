import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, UserCircle2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { fetchWithAuth } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

type ProfilePayload = {
  profile: {
    id: string;
    email: string | null;
    displayName: string;
    role: string | null;
    organizationId: string | null;
    membershipId: string | null;
  };
};

async function safeJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const raw = await response.text();

  if (!raw) {
    return { error: fallbackMessage } as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return { error: fallbackMessage } as T;
  }
}

export function ProfilePage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setIsLoading(true);
      setError(null);

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session?.user || session.user.is_anonymous) {
        navigate("/login", { replace: true });
        return;
      }

      const response = await fetchWithAuth("/api/profile", { method: "GET" });

      if (!active) return;

      if (response.status === 401) {
        navigate("/login", { replace: true });
        return;
      }

      const payload = await safeJson<ProfilePayload | { error?: string }>(
        response,
        "Unable to load profile."
      );

      if (!response.ok) {
        setError("error" in payload ? payload.error ?? "Unable to load profile." : "Unable to load profile.");
        setIsLoading(false);
        return;
      }

      const profile = (payload as ProfilePayload).profile;
      setDisplayName(profile.displayName ?? "");
      setEmail(profile.email ?? "");
      setRole(profile.role);
      setIsLoading(false);
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSaving(true);

    const response = await fetchWithAuth("/api/profile", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: displayName.trim() || null
      })
    });

    const payload = await safeJson<ProfilePayload | { error?: string }>(
      response,
      "Unable to save profile."
    );

    if (!response.ok) {
      setError("error" in payload ? payload.error ?? "Unable to save profile." : "Unable to save profile.");
      setIsSaving(false);
      return;
    }

    const profile = (payload as ProfilePayload).profile;
    setDisplayName(profile.displayName ?? "");
    setEmail(profile.email ?? "");
    setRole(profile.role);
    setMessage("Profile updated.");
    setIsSaving(false);
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)] text-sm text-[var(--muted-foreground)]">
        Loading profile...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
          to="/room/hard-hat-system"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to workspace
        </Link>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-lg bg-[var(--accent)] p-2 text-[var(--primary)]">
              <UserCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-medium text-[var(--foreground)]">My Profile</h1>
              <p className="text-sm text-[var(--muted-foreground)]">
                Update your personal account details for this workspace.
              </p>
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSave}>
            <label className="block space-y-1">
              <span className="text-sm text-[var(--foreground)]">Display Name</span>
              <input
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none"
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your name"
                value={displayName}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-[var(--foreground)]">Email</span>
              <input
                className="w-full cursor-not-allowed rounded-lg border border-[var(--border)] bg-[var(--accent)] px-3 py-2 text-sm text-[var(--muted-foreground)]"
                disabled
                value={email}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-[var(--foreground)]">Role</span>
              <input
                className="w-full cursor-not-allowed rounded-lg border border-[var(--border)] bg-[var(--accent)] px-3 py-2 text-sm text-[var(--muted-foreground)] capitalize"
                disabled
                value={role ?? "member"}
              />
            </label>

            <div className="pt-2">
              <button
                className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                disabled={isSaving}
                type="submit"
              >
                {isSaving ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
