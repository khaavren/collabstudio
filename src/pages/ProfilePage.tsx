import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Upload, UserCircle2, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { SiteTopNav } from "@/components/SiteTopNav";
import { fetchWithAuth } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

type ProfilePayload = {
  profile: {
    id: string;
    email: string | null;
    displayName: string;
    avatarUrl: string | null;
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
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
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
      setProfileId(profile.id);
      setDisplayName(profile.displayName ?? "");
      setEmail(profile.email ?? "");
      setAvatarUrl(profile.avatarUrl ?? null);
      setRole(profile.role);
      setIsLoading(false);
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [avatarFile]);

  async function uploadAvatar(file: File, userId: string) {
    const extension = file.name.includes(".")
      ? file.name.split(".").pop()?.toLowerCase() ?? "png"
      : "png";
    const safeExtension = /^(png|jpg|jpeg|webp|gif|svg)$/.test(extension) ? extension : "png";
    const storagePath = `profiles/${userId}/avatar-${Date.now()}.${safeExtension}`;

    const { error: uploadError } = await supabase.storage.from("bandjoes-assets").upload(storagePath, file, {
      contentType: file.type || "image/png",
      upsert: true
    });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage.from("bandjoes-assets").getPublicUrl(storagePath);
    return data.publicUrl;
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSaving(true);

    let nextAvatarUrl = avatarUrl;

    try {
      if (avatarFile) {
        if (!profileId) {
          throw new Error("Missing profile ID for avatar upload.");
        }
        nextAvatarUrl = await uploadAvatar(avatarFile, profileId);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to upload avatar.");
      setIsSaving(false);
      return;
    }

    const response = await fetchWithAuth("/api/profile", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: displayName.trim() || null,
        avatarUrl: nextAvatarUrl
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
    setProfileId(profile.id);
    setDisplayName(profile.displayName ?? "");
    setEmail(profile.email ?? "");
    setAvatarUrl(profile.avatarUrl ?? null);
    setAvatarFile(null);
    setAvatarPreview(null);
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
              <div className="space-y-1">
                <span className="text-sm text-[var(--foreground)]">Avatar</span>
                <div className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-white px-3 py-3">
                  {avatarPreview || avatarUrl ? (
                    <img
                      alt="Profile avatar"
                      className="h-14 w-14 rounded-full border border-[var(--border)] object-cover"
                      src={avatarPreview ?? avatarUrl ?? undefined}
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
                      onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
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

                    {avatarPreview || avatarUrl ? (
                      <button
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-[var(--muted-foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                        onClick={() => {
                          setAvatarFile(null);
                          setAvatarPreview(null);
                          setAvatarUrl(null);
                        }}
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
    </div>
  );
}
