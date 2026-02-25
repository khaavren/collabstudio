import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Upload, UserCircle2, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/auth-context";
import { SiteTopNav } from "@/components/SiteTopNav";

export function ProfilePage() {
  const navigate = useNavigate();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, updateUser, user } = useAuth();

  const [displayName, setDisplayName] = useState(user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    setDisplayName(user?.name ?? "");
    setAvatarUrl(user?.avatarUrl ?? null);
  }, [user]);

  function handleAvatarUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const next = typeof reader.result === "string" ? reader.result : null;
      setAvatarUrl(next);
    };
    reader.readAsDataURL(file);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);

    updateUser({
      name: displayName.trim() || (user?.email?.split("@")[0] ?? "User"),
      avatarUrl
    });

    setMessage("Profile updated.");
    setIsSaving(false);
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <SiteTopNav />
      <main className="flex-1 px-6 py-10">
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
                  Update your personal account details for this site.
                </p>
              </div>
            </div>

            {message ? (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {message}
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={handleSave}>
              <div className="space-y-1">
                <span className="text-sm text-[var(--foreground)]">Avatar</span>
                <div className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-white px-3 py-3">
                  {avatarUrl ? (
                    <img
                      alt="Profile avatar"
                      className="h-14 w-14 rounded-full border border-[var(--border)] object-cover"
                      src={avatarUrl}
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--accent)] text-[var(--muted-foreground)]">
                      <UserCircle2 className="h-7 w-7" />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        handleAvatarUpload(file);
                      }}
                      ref={avatarInputRef}
                      type="file"
                    />
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--accent)]"
                      onClick={() => avatarInputRef.current?.click()}
                      type="button"
                    >
                      <Upload className="h-4 w-4" />
                      Upload Avatar
                    </button>

                    {avatarUrl ? (
                      <button
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-[var(--muted-foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                        onClick={() => setAvatarUrl(null)}
                        type="button"
                      >
                        <X className="h-4 w-4" />
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

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
                  value={user?.email ?? ""}
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
    </div>
  );
}
