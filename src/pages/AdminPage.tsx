import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenText,
  CheckCircle2,
  LogOut,
  Upload
} from "lucide-react";
import { Link } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { fetchWithAuth, type AdminSettingsResponse, type TeamRole } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

const EMPTY_ORG_FORM = {
  name: "",
  slug: "",
  website: "",
  contactEmail: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: ""
};

const EMPTY_API_FORM = {
  provider: "OpenAI",
  model: "",
  apiKey: "",
  defaultImageSize: "1024x1024",
  defaultParams: "{}"
};

type AdminTab = "organization" | "account" | "model" | "usage" | "security";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function publicStorageUrl(path: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from("bandjoes-assets").getPublicUrl(path);
  return data.publicUrl;
}

async function safeJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const raw = await response.text();

  if (!raw) {
    return { error: fallbackMessage } as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    const looksLikeHtml = raw.toLowerCase().includes("<html") || raw.toLowerCase().includes("<!doctype");
    const condensed = raw.replace(/\s+/g, " ").trim().slice(0, 180);

    return {
      error: looksLikeHtml ? fallbackMessage : condensed || fallbackMessage
    } as T;
  }
}

async function uploadLogo(file: File, organizationId: string) {
  const extension = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase() ?? "png"
    : "png";
  const safeExtension = /^(png|jpg|jpeg|webp|svg)$/.test(extension) ? extension : "png";
  const storagePath = `orgs/${organizationId}/branding/logo-${Date.now()}.${safeExtension}`;

  const { error } = await supabase.storage.from("bandjoes-assets").upload(storagePath, file, {
    contentType: file.type || "image/png",
    upsert: true
  });

  if (error) {
    throw new Error(error.message);
  }

  return storagePath;
}

export function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<AdminSettingsResponse | null>(null);
  const [orgForm, setOrgForm] = useState(EMPTY_ORG_FORM);
  const [apiForm, setApiForm] = useState(EMPTY_API_FORM);
  const [teamRoleDrafts, setTeamRoleDrafts] = useState<Record<string, TeamRole>>({});
  const [teamNameDrafts, setTeamNameDrafts] = useState<Record<string, string>>({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("viewer");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("organization");
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    async function init() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!active) return;
      setUser(session?.user ?? null);
      setAuthLoading(false);
    }

    void init();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadSettings = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const response = await fetchWithAuth("/api/admin/settings", {
      method: "GET"
    });

    if (response.status === 403) {
      setIsUnauthorized(true);
      setSettings(null);
      setIsLoading(false);
      return;
    }

    const payload = await safeJson<AdminSettingsResponse | { error: string }>(
      response,
      "Admin API route is unavailable."
    );

    if (!response.ok) {
      setError("error" in payload ? payload.error : "Failed to load admin settings.");
      setSettings(null);
      setIsLoading(false);
      return;
    }

    const nextSettings = payload as AdminSettingsResponse;
    setSettings(nextSettings);
    setIsUnauthorized(false);

    setOrgForm({
      name: nextSettings.organization.name,
      slug: nextSettings.organization.slug,
      website: nextSettings.organization.website ?? "",
      contactEmail: nextSettings.organization.contact_email ?? "",
      phone: nextSettings.organization.phone ?? "",
      addressLine1: nextSettings.organization.address_line1 ?? "",
      addressLine2: nextSettings.organization.address_line2 ?? "",
      city: nextSettings.organization.city ?? "",
      state: nextSettings.organization.state ?? "",
      postalCode: nextSettings.organization.postal_code ?? "",
      country: nextSettings.organization.country ?? ""
    });

    setApiForm({
      provider: nextSettings.apiSettings.provider || "OpenAI",
      model: nextSettings.apiSettings.model || "",
      apiKey: "",
      defaultImageSize: nextSettings.apiSettings.defaultImageSize || "1024x1024",
      defaultParams: JSON.stringify(nextSettings.apiSettings.defaultParams ?? {}, null, 2)
    });

    setTeamRoleDrafts(
      Object.fromEntries(nextSettings.teamMembers.map((member) => [member.id, member.role]))
    );
    setTeamNameDrafts(
      Object.fromEntries(
        nextSettings.teamMembers.map((member) => [
          member.id,
          member.displayName ?? member.email?.split("@")[0] ?? ""
        ])
      )
    );

    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      void loadSettings();
    }
  }, [authLoading, loadSettings]);

  const logoPreview = useMemo(() => {
    if (!logoFile) return null;
    return URL.createObjectURL(logoFile);
  }, [logoFile]);

  useEffect(() => {
    return () => {
      if (logoPreview) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoPreview]);

  async function saveSettings() {
    if (!settings) return;

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      let logoStoragePath: string | undefined;
      if (logoFile) {
        logoStoragePath = await uploadLogo(logoFile, settings.organization.id);
      }

      const response = await fetchWithAuth("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({
          organization: {
            name: orgForm.name,
            slug: orgForm.slug,
            website: orgForm.website,
            contactEmail: orgForm.contactEmail,
            phone: orgForm.phone,
            addressLine1: orgForm.addressLine1,
            addressLine2: orgForm.addressLine2,
            city: orgForm.city,
            state: orgForm.state,
            postalCode: orgForm.postalCode,
            country: orgForm.country,
            logoStoragePath
          },
          api: {
            provider: apiForm.provider,
            model: apiForm.model,
            apiKey: apiForm.apiKey,
            defaultImageSize: apiForm.defaultImageSize,
            defaultParams: apiForm.defaultParams
          }
        })
      });

      const payload = await safeJson<AdminSettingsResponse | { error: string }>(
        response,
        "Unable to save settings."
      );
      if (!response.ok) {
        setError("error" in payload ? payload.error : "Unable to save settings.");
        setIsSaving(false);
        return;
      }

      setSettings(payload as AdminSettingsResponse);
      setApiForm((current) => ({ ...current, apiKey: "" }));
      setLogoFile(null);
      setMessage("Settings saved.");
      await loadSettings();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save settings.");
    } finally {
      setIsSaving(false);
    }
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!adminEmail.trim()) {
      setError("Admin email is required.");
      return;
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (session?.user?.is_anonymous) {
      await supabase.auth.signOut();
    }

    const email = adminEmail.trim();

    const adminRedirect = `${window.location.origin}/admin`;
    let signInError: string | null = null;

    const primaryAttempt = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: adminRedirect
      }
    });

    if (primaryAttempt.error) {
      const message = primaryAttempt.error.message.toLowerCase();
      const shouldRetryWithoutCustomRedirect =
        message.includes("redirect") || message.includes("not allowed") || message.includes("invalid");

      if (shouldRetryWithoutCustomRedirect) {
        const fallbackAttempt = await supabase.auth.signInWithOtp({
          email
        });

        if (fallbackAttempt.error) {
          signInError = fallbackAttempt.error.message;
        }
      } else {
        signInError = primaryAttempt.error.message;
      }
    }

    if (signInError) {
      setError(signInError);
      return;
    }

    setMessage("Magic link sent. Open the email and return to /admin.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSettings(null);
    setIsUnauthorized(false);
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsInviting(true);
    setError(null);
    setMessage(null);

    const response = await fetchWithAuth("/api/admin/team/invite", {
      method: "POST",
      body: JSON.stringify({
        email: inviteEmail,
        role: inviteRole
      })
    });

    const payload = await safeJson<{ message?: string; error?: string }>(response, "Invite failed.");

    if (!response.ok) {
      setError(payload.error ?? "Invite failed.");
      setIsInviting(false);
      return;
    }

    setInviteEmail("");
    setInviteRole("viewer");
    setMessage(payload.message ?? "Invite sent.");
    await loadSettings();
    setIsInviting(false);
  }

  async function updateMember(memberId: string) {
    setError(null);
    setMessage(null);

    const role = teamRoleDrafts[memberId];
    const displayName = teamNameDrafts[memberId] ?? "";
    if (!role) return;

    const response = await fetchWithAuth(`/api/admin/team/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ role, displayName })
    });

    const payload = await safeJson<{ error?: string }>(response, "Unable to update member.");

    if (!response.ok) {
      setError(payload.error ?? `Unable to update member (HTTP ${response.status}).`);
      return;
    }

    setMessage("Member updated.");
    await loadSettings();
  }

  async function removeMember(memberId: string) {
    const response = await fetchWithAuth(`/api/admin/team/${memberId}`, {
      method: "DELETE"
    });

    const payload = await safeJson<{ error?: string }>(response, "Unable to remove member.");

    if (!response.ok) {
      setError(payload.error ?? "Unable to remove member.");
      return;
    }

    setMessage("Member removed.");
    await loadSettings();
  }

  async function testConnection() {
    setIsTesting(true);
    setTestMessage(null);

    const response = await fetchWithAuth("/api/admin/test", {
      method: "POST",
      body: JSON.stringify({})
    });

    const payload = await safeJson<{ message?: string; error?: string }>(
      response,
      "Connection test failed."
    );

    if (!response.ok) {
      setTestMessage(payload.error ?? "Connection test failed.");
      setIsTesting(false);
      return;
    }

    setTestMessage(payload.message ?? "Connection test complete.");
    await loadSettings();
    setIsTesting(false);
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted-foreground)]">
        Loading admin settings...
      </div>
    );
  }

  if (!user || user.is_anonymous) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center p-6">
        <div className="w-full space-y-4 rounded-xl border border-[var(--border)] bg-white p-5">
          <h1 className="text-lg font-medium text-[var(--foreground)]">Admin Sign In</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Use an email listed in ADMIN_EMAILS to access /admin.
          </p>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}

          <form className="space-y-3" onSubmit={sendMagicLink}>
            <input
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              onChange={(event) => setAdminEmail(event.target.value)}
              placeholder="admin@company.com"
              type="email"
              value={adminEmail}
            />
            <button
              className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
              type="submit"
            >
              Send Magic Link
            </button>
          </form>

          <Link className="block text-sm text-[var(--muted-foreground)] hover:underline" to="/">
            Back to workspace
          </Link>
        </div>
      </main>
    );
  }

  if (isUnauthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-white px-6 py-5 text-sm text-[var(--foreground)]">
          <p>Not authorized</p>
          <div className="flex items-center gap-3">
            <button className="text-[var(--muted-foreground)] hover:underline" onClick={signOut} type="button">
              Sign out
            </button>
            <Link className="text-[var(--muted-foreground)] hover:underline" to="/">
              Back to workspace
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!settings) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
          {error ?? "Unable to load admin settings."}
        </div>
      </main>
    );
  }

  const logoUrl = publicStorageUrl(settings.organization.logo_storage_path);
  const tabs: Array<{ id: AdminTab; label: string }> = [
    { id: "organization", label: "Organization Profile" },
    { id: "account", label: "Account & Team" },
    { id: "model", label: "Model API Configuration" },
    { id: "usage", label: "Usage & Limits" },
    { id: "security", label: "Security & Environment" }
  ];

  return (
    <main className="min-h-screen bg-[#eef1f5] text-[var(--foreground)]">
      <div className="flex min-h-screen">
        <aside className="flex w-[310px] shrink-0 flex-col border-r border-white/15 bg-gradient-to-b from-[#313c50] to-[#2a3345] text-[#d9e0eb]">
          <div className="flex items-center gap-3 border-b border-white/15 px-8 py-5">
            <div className="rounded-md bg-white/10 p-2">
              <BookOpenText className="h-5 w-5" />
            </div>
            <p className="text-2xl font-semibold tracking-tight">
              MagisterLudi <span className="text-xl font-normal opacity-85">Studio</span>
            </p>
          </div>

          <div className="px-8 py-4">
            <Link
              className="inline-flex items-center gap-2 text-base text-[#d9e0eb] transition hover:text-white"
              to="/"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to App
            </Link>
          </div>

          <div className="mt-auto border-t border-white/15 px-8 py-6">
            <p className="truncate text-sm text-[#d9e0eb]">{user.email ?? "Unknown user"}</p>
            <button
              className="mt-2 inline-flex items-center gap-2 text-sm text-[#d9e0eb] transition hover:text-white"
              onClick={signOut}
              type="button"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-300/60 bg-white px-8 py-5">
            <h1 className="text-4xl font-semibold text-[#243042]">Admin Dashboard</h1>
          </header>

          <nav className="border-b border-slate-300/60 bg-[#f5f7fb] px-8">
            <div className="flex overflow-x-auto">
              {tabs.map((tab) => (
                <button
                    className={`whitespace-nowrap border-b-2 px-5 py-3 text-sm font-semibold transition ${
                    activeTab === tab.id
                      ? "border-[#2b66d5] text-[#2b66d5]"
                      : "border-transparent text-slate-600 hover:text-slate-800"
                  }`}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </div>
            ) : null}

            {activeTab === "organization" ? (
              <section className="rounded-lg border border-slate-300 bg-[#f8f9fb]">
                <div className="border-b border-slate-300 px-5 py-4">
                  <h2 className="text-2xl font-semibold text-[#243042]">Organization Profile</h2>
                </div>

                <div className="grid gap-4 p-5 lg:grid-cols-[1fr_420px]">
                  <div className="space-y-3">
                    <label className="grid items-center gap-3 md:grid-cols-[170px_1fr]">
                      <span className="text-right text-sm font-medium text-slate-700">Organization Name:</span>
                      <input
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
                        onChange={(event) => {
                          const value = event.target.value;
                          setOrgForm((current) => ({
                            ...current,
                            name: value,
                            slug: current.slug || slugify(value)
                          }));
                        }}
                        value={orgForm.name}
                      />
                    </label>

                    <label className="grid items-center gap-3 md:grid-cols-[170px_1fr]">
                      <span className="text-right text-sm font-medium text-slate-700">Slug:</span>
                      <input
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
                        onChange={(event) =>
                          setOrgForm((current) => ({ ...current, slug: slugify(event.target.value) }))
                        }
                        value={orgForm.slug}
                      />
                    </label>

                    <label className="grid items-center gap-3 md:grid-cols-[170px_1fr]">
                      <span className="text-right text-sm font-medium text-slate-700">Website:</span>
                      <input
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
                        onChange={(event) =>
                          setOrgForm((current) => ({ ...current, website: event.target.value }))
                        }
                        value={orgForm.website}
                      />
                    </label>

                    <label className="grid items-center gap-3 md:grid-cols-[170px_1fr]">
                      <span className="text-right text-sm font-medium text-slate-700">Contact Email:</span>
                      <input
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
                        onChange={(event) =>
                          setOrgForm((current) => ({ ...current, contactEmail: event.target.value }))
                        }
                        value={orgForm.contactEmail}
                      />
                    </label>

                    <label className="grid items-center gap-3 md:grid-cols-[170px_1fr]">
                      <span className="text-right text-sm font-medium text-slate-700">Phone:</span>
                      <input
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
                        onChange={(event) =>
                          setOrgForm((current) => ({ ...current, phone: event.target.value }))
                        }
                        value={orgForm.phone}
                      />
                    </label>

                    <label className="grid items-start gap-3 md:grid-cols-[170px_1fr]">
                      <span className="pt-2 text-right text-sm font-medium text-slate-700">Address:</span>
                      <div className="space-y-2">
                        <input
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
                          onChange={(event) =>
                            setOrgForm((current) => ({ ...current, addressLine1: event.target.value }))
                          }
                          value={orgForm.addressLine1}
                        />
                        <input
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
                          onChange={(event) =>
                            setOrgForm((current) => ({ ...current, addressLine2: event.target.value }))
                          }
                          value={orgForm.addressLine2}
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
                            onChange={(event) =>
                              setOrgForm((current) => ({ ...current, city: event.target.value }))
                            }
                            value={orgForm.city}
                          />
                          <input
                            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
                            onChange={(event) =>
                              setOrgForm((current) => ({ ...current, state: event.target.value }))
                            }
                            value={orgForm.state}
                          />
                          <input
                            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
                            onChange={(event) =>
                              setOrgForm((current) => ({ ...current, postalCode: event.target.value }))
                            }
                            value={orgForm.postalCode}
                          />
                        </div>
                        <input
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
                          onChange={(event) =>
                            setOrgForm((current) => ({ ...current, country: event.target.value }))
                          }
                          value={orgForm.country}
                        />
                      </div>
                    </label>
                  </div>

                  <div className="flex flex-col overflow-hidden rounded-md border border-slate-300 bg-white">
                    <div className="flex flex-1 items-center justify-center p-6">
                      {logoPreview || logoUrl ? (
                        <img
                          alt="Organization logo"
                          className="max-h-[200px] w-auto max-w-full object-contain"
                          src={logoPreview ?? logoUrl ?? undefined}
                        />
                      ) : (
                        <div className="text-center text-slate-400">
                          <p className="text-2xl font-semibold">No logo uploaded</p>
                        </div>
                      )}
                    </div>
                    <div className="border-t border-slate-300 p-4">
                      <input
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                        ref={logoInputRef}
                        type="file"
                      />
                      <button
                        className="mx-auto inline-flex w-full max-w-[220px] items-center justify-center gap-2 rounded-md bg-[#2b66d5] px-4 py-2 text-lg font-semibold text-white transition hover:bg-[#2457b5]"
                        onClick={() => logoInputRef.current?.click()}
                        type="button"
                      >
                        <Upload className="h-4 w-4" />
                        Upload New Logo
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-300 px-6 py-4 text-center">
                  <button
                    className="rounded-md bg-[#2b66d5] px-8 py-2 text-base font-semibold text-white transition hover:bg-[#2457b5] disabled:opacity-60"
                    disabled={isSaving}
                    onClick={saveSettings}
                    type="button"
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </section>
            ) : null}

            {activeTab === "account" ? (
              <section className="rounded-lg border border-slate-300 bg-[#f8f9fb]">
                <div className="border-b border-slate-300 px-5 py-4">
                  <h2 className="text-2xl font-semibold text-[#243042]">Team Members</h2>
                </div>

                <div className="p-5">
                  <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_170px]" onSubmit={inviteMember}>
                    <input
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-lg"
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="member@company.com"
                      required
                      type="email"
                      value={inviteEmail}
                    />
                    <select
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-lg"
                      onChange={(event) => setInviteRole(event.target.value as TeamRole)}
                      value={inviteRole}
                    >
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      className="rounded-md bg-[#2b66d5] px-4 py-2 text-lg font-semibold text-white transition hover:bg-[#2457b5] disabled:opacity-60"
                      disabled={isInviting}
                      type="submit"
                    >
                      {isInviting ? "Inviting..." : "Invite New Member"}
                    </button>
                  </form>

                  {settings.teamMembers.length === 0 ? (
                    <p className="text-lg text-slate-500">No team members found.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border border-slate-300 bg-white">
                      <table className="w-full min-w-[760px] text-left">
                        <thead className="border-b border-slate-300 bg-[#f1f4f8] text-lg text-slate-600">
                          <tr>
                            <th className="px-4 py-2 font-semibold">Name / User</th>
                            <th className="px-4 py-2 font-semibold">Email</th>
                            <th className="px-4 py-2 font-semibold">Role</th>
                            <th className="px-4 py-2 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {settings.teamMembers.map((member) => (
                            <tr className="border-b border-slate-200 last:border-b-0" key={member.id}>
                              <td className="space-y-1 px-4 py-3">
                                <input
                                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-base font-medium text-slate-800"
                                  onChange={(event) =>
                                    setTeamNameDrafts((current) => ({
                                      ...current,
                                      [member.id]: event.target.value
                                    }))
                                  }
                                  placeholder="Full name"
                                  value={teamNameDrafts[member.id] ?? ""}
                                />
                                <p className="text-xs text-slate-500">User ID: {member.user_id}</p>
                              </td>
                              <td className="px-4 py-3 text-lg text-slate-700">{member.email ?? "Pending invite"}</td>
                              <td className="px-4 py-3">
                                <select
                                  className="w-full max-w-[180px] rounded-md border border-slate-300 bg-white px-2 py-1 text-lg"
                                  onChange={(event) =>
                                    setTeamRoleDrafts((current) => ({
                                      ...current,
                                      [member.id]: event.target.value as TeamRole
                                    }))
                                  }
                                  value={teamRoleDrafts[member.id] ?? member.role}
                                >
                                  <option value="admin">Admin</option>
                                  <option value="editor">Editor</option>
                                  <option value="viewer">Viewer</option>
                                </select>
                              </td>
                              <td className="space-x-3 px-4 py-3 text-lg">
                                <button
                                  className="text-[#2b66d5] hover:underline"
                                  onClick={() => {
                                    void updateMember(member.id);
                                  }}
                                  type="button"
                                >
                                  Save
                                </button>
                                <button
                                  className="text-[#2b66d5] hover:underline"
                                  onClick={() => {
                                    void removeMember(member.id);
                                  }}
                                  type="button"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            ) : null}

            {activeTab === "model" ? (
              <section className="rounded-lg border border-slate-300 bg-[#f8f9fb]">
                <div className="border-b border-slate-300 px-5 py-4">
                  <h2 className="text-2xl font-semibold text-[#243042]">Model API Configuration</h2>
                </div>

                <div className="grid gap-3 p-5 sm:grid-cols-2">
                  <label className="text-lg font-medium text-slate-700">
                    Provider
                    <select
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-lg"
                      onChange={(event) =>
                        setApiForm((current) => ({ ...current, provider: event.target.value }))
                      }
                      value={apiForm.provider}
                    >
                      <option>OpenAI</option>
                      <option>Replicate</option>
                      <option>Stability</option>
                      <option>Custom HTTP</option>
                    </select>
                  </label>

                  <label className="text-lg font-medium text-slate-700">
                    Model Name
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-lg"
                      onChange={(event) => setApiForm((current) => ({ ...current, model: event.target.value }))}
                      value={apiForm.model}
                    />
                  </label>

                  <label className="text-lg font-medium text-slate-700">
                    API Key
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-lg"
                      onChange={(event) => setApiForm((current) => ({ ...current, apiKey: event.target.value }))}
                      placeholder="Leave blank to keep existing key"
                      type="password"
                      value={apiForm.apiKey}
                    />
                  </label>

                  <label className="text-lg font-medium text-slate-700">
                    Default Image Size
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-lg"
                      onChange={(event) =>
                        setApiForm((current) => ({ ...current, defaultImageSize: event.target.value }))
                      }
                      value={apiForm.defaultImageSize}
                    />
                  </label>

                  <label className="text-lg font-medium text-slate-700 sm:col-span-2">
                    Advanced Params (JSON)
                    <textarea
                      className="mt-1 min-h-36 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-base"
                      onChange={(event) =>
                        setApiForm((current) => ({ ...current, defaultParams: event.target.value }))
                      }
                      value={apiForm.defaultParams}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-300 px-5 py-4">
                  <button
                    className="rounded-md bg-[#2b66d5] px-5 py-2 text-lg font-semibold text-white transition hover:bg-[#2457b5] disabled:opacity-60"
                    disabled={isSaving}
                    onClick={saveSettings}
                    type="button"
                  >
                    {isSaving ? "Saving..." : "Save Configuration"}
                  </button>
                  <button
                    className="rounded-md border border-slate-300 bg-white px-5 py-2 text-lg text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    disabled={isTesting}
                    onClick={testConnection}
                    type="button"
                  >
                    {isTesting ? "Testing..." : "Test Connection"}
                  </button>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                      settings.apiSettings.configured
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {settings.apiSettings.configured ? "Configured" : "Not Configured"}
                  </span>
                </div>

                {testMessage ? (
                  <p className="px-5 pb-5 text-base text-slate-700">{testMessage}</p>
                ) : null}
              </section>
            ) : null}

            {activeTab === "usage" ? (
              <section className="rounded-lg border border-slate-300 bg-[#f8f9fb] p-5">
                <h2 className="text-2xl font-semibold text-[#243042]">Usage & Limits</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-md border border-slate-300 bg-white p-4">
                    <p className="text-sm uppercase tracking-wide text-slate-500">Month</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-800">{settings.usage.month}</p>
                  </div>
                  <div className="rounded-md border border-slate-300 bg-white p-4">
                    <p className="text-sm uppercase tracking-wide text-slate-500">Images Generated</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-800">
                      {settings.usage.images_generated}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-300 bg-white p-4">
                    <p className="text-sm uppercase tracking-wide text-slate-500">Storage (MB)</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-800">
                      {settings.usage.storage_used_mb}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-300 bg-white p-4">
                    <p className="text-sm uppercase tracking-wide text-slate-500">API Calls</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-800">{settings.usage.api_calls}</p>
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === "security" ? (
              <section className="rounded-lg border border-slate-300 bg-[#f8f9fb] p-5">
                <h2 className="text-2xl font-semibold text-[#243042]">Security & Environment</h2>
                <div className="mt-4 space-y-2 rounded-md border border-slate-300 bg-white p-4 text-lg text-slate-700">
                  <p>Supabase connected: {settings.security.supabaseConnected ? "Yes" : "No"}</p>
                  <p>Storage bucket connected: {settings.security.storageBucketConnected ? "Yes" : "No"}</p>
                  <p>Model API configured: {settings.security.modelApiConfigured ? "Yes" : "No"}</p>
                  <p>
                    Last settings update:{" "}
                    {new Date(settings.security.lastSettingsUpdate).toLocaleString()}
                  </p>
                  <p>App version: {settings.security.appVersion}</p>
                </div>
              </section>
            ) : null}
          </div>

          <footer className="border-t border-slate-300 bg-white px-6 py-3">
            <div className="grid gap-3 text-base sm:grid-cols-2 xl:grid-cols-5">
              <div className="flex items-center gap-2 text-slate-700">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Supabase: <span className="font-semibold text-emerald-700">Connected</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Storage: <span className="font-semibold text-emerald-700">Active</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                {settings.apiSettings.configured ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                )}
                Model API:{" "}
                <span className={settings.apiSettings.configured ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                  {settings.apiSettings.configured ? "Configured" : "Not Configured"}
                </span>
              </div>
              <div className="text-slate-700">
                Last update:{" "}
                <span className="font-semibold">
                  {new Date(settings.security.lastSettingsUpdate).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-slate-500">App Version: {settings.security.appVersion}</div>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
