"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { fetchWithAuth } from "@/lib/client/auth-fetch";
import type { Organization, TeamMemberWithUser, TeamRole } from "@/lib/types";

type AdminSettingsResponse = {
  organization: Organization;
  teamMembers: TeamMemberWithUser[];
  apiSettings: {
    provider: string;
    model: string;
    defaultImageSize: string;
    defaultParams: Record<string, unknown>;
    configured: boolean;
    updatedAt: string | null;
  };
  usage: {
    month: string;
    images_generated: number;
    storage_used_mb: number;
    api_calls: number;
  };
  security: {
    supabaseConnected: boolean;
    storageBucketConnected: boolean;
    modelApiConfigured: boolean;
    lastSettingsUpdate: string;
    appVersion: string;
  };
};

type OrgFormState = {
  name: string;
  slug: string;
  website: string;
  contactEmail: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type ApiFormState = {
  provider: string;
  model: string;
  apiKey: string;
  defaultImageSize: string;
  defaultParams: string;
};

const emptyOrgForm: OrgFormState = {
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

const emptyApiForm: ApiFormState = {
  provider: "OpenAI",
  model: "",
  apiKey: "",
  defaultImageSize: "1024x1024",
  defaultParams: "{}"
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export function AdminSettingsClient() {
  return (
    <AuthGate>
      {({ user, signOut }) => (
        <AdminSettingsShell onSignOut={signOut} userEmail={user.email ?? ""} />
      )}
    </AuthGate>
  );
}

function AdminSettingsShell({
  onSignOut,
  userEmail
}: {
  onSignOut: () => Promise<void>;
  userEmail: string;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<AdminSettingsResponse | null>(null);
  const [orgForm, setOrgForm] = useState<OrgFormState>(emptyOrgForm);
  const [apiForm, setApiForm] = useState<ApiFormState>(emptyApiForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("viewer");
  const [teamRoleDrafts, setTeamRoleDrafts] = useState<Record<string, TeamRole>>({});

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const response = await fetchWithAuth("/api/admin/settings", {
      method: "GET"
    });

    if (response.status === 403) {
      setIsUnauthorized(true);
      setIsLoading(false);
      return;
    }

    const payload = (await response.json()) as AdminSettingsResponse | { error: string };

    if (!response.ok) {
      const message = "error" in payload ? payload.error : "Failed to load admin settings.";
      setError(message);
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

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const logoPreview = useMemo(() => {
    if (!logoFile) return null;
    return URL.createObjectURL(logoFile);
  }, [logoFile]);

  async function saveSettings() {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append("name", orgForm.name);
    formData.append("slug", orgForm.slug);
    formData.append("website", orgForm.website);
    formData.append("contactEmail", orgForm.contactEmail);
    formData.append("phone", orgForm.phone);
    formData.append("addressLine1", orgForm.addressLine1);
    formData.append("addressLine2", orgForm.addressLine2);
    formData.append("city", orgForm.city);
    formData.append("state", orgForm.state);
    formData.append("postalCode", orgForm.postalCode);
    formData.append("country", orgForm.country);

    formData.append("provider", apiForm.provider);
    formData.append("model", apiForm.model);
    formData.append("apiKey", apiForm.apiKey);
    formData.append("defaultImageSize", apiForm.defaultImageSize);
    formData.append("defaultParams", apiForm.defaultParams);

    if (logoFile) {
      formData.append("logo", logoFile);
    }

    const response = await fetchWithAuth("/api/admin/settings", {
      method: "POST",
      body: formData
    });

    const payload = (await response.json()) as AdminSettingsResponse | { error: string };

    if (!response.ok) {
      const message = "error" in payload ? payload.error : "Unable to save settings.";
      setError(message);
      setIsSaving(false);
      return;
    }

    setApiForm((current) => ({ ...current, apiKey: "" }));
    setLogoFile(null);
    setSuccess("Settings saved.");
    setSettings(payload as AdminSettingsResponse);
    await loadSettings();
    setIsSaving(false);
  }

  async function inviteMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsInviting(true);
    setError(null);
    setSuccess(null);

    const response = await fetchWithAuth("/api/admin/team/invite", {
      method: "POST",
      body: JSON.stringify({
        email: inviteEmail,
        role: inviteRole
      })
    });

    const payload = (await response.json()) as { message?: string; error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Invite failed.");
      setIsInviting(false);
      return;
    }

    setInviteEmail("");
    setInviteRole("viewer");
    setSuccess(payload.message ?? "Invite sent.");
    await loadSettings();
    setIsInviting(false);
  }

  async function updateMemberRole(memberId: string) {
    const role = teamRoleDrafts[memberId];
    if (!role) return;

    setError(null);
    setSuccess(null);

    const response = await fetchWithAuth(`/api/admin/team/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ role })
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Failed to update role.");
      return;
    }

    setSuccess("Role updated.");
    await loadSettings();
  }

  async function removeMember(memberId: string) {
    setError(null);
    setSuccess(null);

    const response = await fetchWithAuth(`/api/admin/team/${memberId}`, {
      method: "DELETE"
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Failed to remove member.");
      return;
    }

    setSuccess("Member removed.");
    await loadSettings();
  }

  async function testConnection() {
    setIsTesting(true);
    setTestMessage(null);

    const response = await fetchWithAuth("/api/admin/test", {
      method: "POST",
      body: JSON.stringify({})
    });

    const payload = (await response.json()) as { message?: string; error?: string };

    if (!response.ok) {
      setTestMessage(payload.error ?? "Connection test failed.");
      setIsTesting(false);
      return;
    }

    setTestMessage(payload.message ?? "Connection test completed.");
    await loadSettings();
    setIsTesting(false);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-stone-600">
        Loading admin settings...
      </div>
    );
  }

  if (isUnauthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-lg border border-stone-300 bg-white px-6 py-4 text-sm text-stone-700">
          Not authorized
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

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Account & Infrastructure Settings</h1>
          <p className="mt-1 text-sm text-stone-600">Admin Control Panel for Band Joes Studio</p>
        </div>
        <div className="text-right text-sm text-stone-600">
          <p>{userEmail}</p>
          <div className="mt-1 flex items-center justify-end gap-3">
            <Link className="font-medium text-accent hover:underline" href="/rooms">
              Back to Rooms
            </Link>
            <button className="font-medium text-accent hover:underline" onClick={onSignOut} type="button">
              Sign out
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <section className="space-y-3 rounded-xl border border-stone-300 bg-white p-4">
        <h2 className="text-base font-semibold text-stone-900">Section 1 — Organization Profile</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-stone-700">
            Organization Name
            <input
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              onChange={(event) => {
                const value = event.target.value;
                setOrgForm((current) => ({
                  ...current,
                  name: value,
                  slug: current.slug ? current.slug : slugify(value)
                }));
              }}
              value={orgForm.name}
            />
          </label>

          <label className="text-sm text-stone-700">
            Slug
            <input
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              onChange={(event) =>
                setOrgForm((current) => ({ ...current, slug: slugify(event.target.value) }))
              }
              value={orgForm.slug}
            />
          </label>

          <label className="text-sm text-stone-700">
            Website
            <input
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              onChange={(event) =>
                setOrgForm((current) => ({ ...current, website: event.target.value }))
              }
              value={orgForm.website}
            />
          </label>

          <label className="text-sm text-stone-700">
            Contact Email
            <input
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              onChange={(event) =>
                setOrgForm((current) => ({ ...current, contactEmail: event.target.value }))
              }
              value={orgForm.contactEmail}
            />
          </label>

          <label className="text-sm text-stone-700">
            Phone
            <input
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              onChange={(event) => setOrgForm((current) => ({ ...current, phone: event.target.value }))}
              value={orgForm.phone}
            />
          </label>

          <label className="text-sm text-stone-700">
            Logo Upload
            <input
              accept="image/*"
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>

          <label className="text-sm text-stone-700 sm:col-span-2">
            Address Line 1
            <input
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              onChange={(event) =>
                setOrgForm((current) => ({ ...current, addressLine1: event.target.value }))
              }
              value={orgForm.addressLine1}
            />
          </label>

          <label className="text-sm text-stone-700 sm:col-span-2">
            Address Line 2
            <input
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              onChange={(event) =>
                setOrgForm((current) => ({ ...current, addressLine2: event.target.value }))
              }
              value={orgForm.addressLine2}
            />
          </label>

          <label className="text-sm text-stone-700">
            City
            <input
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              onChange={(event) => setOrgForm((current) => ({ ...current, city: event.target.value }))}
              value={orgForm.city}
            />
          </label>

          <label className="text-sm text-stone-700">
            State
            <input
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              onChange={(event) => setOrgForm((current) => ({ ...current, state: event.target.value }))}
              value={orgForm.state}
            />
          </label>

          <label className="text-sm text-stone-700">
            Postal Code
            <input
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              onChange={(event) =>
                setOrgForm((current) => ({ ...current, postalCode: event.target.value }))
              }
              value={orgForm.postalCode}
            />
          </label>

          <label className="text-sm text-stone-700">
            Country
            <input
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              onChange={(event) => setOrgForm((current) => ({ ...current, country: event.target.value }))}
              value={orgForm.country}
            />
          </label>
        </div>

        {logoPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="Logo preview" className="h-20 w-20 rounded-md object-cover" src={logoPreview} />
        ) : settings.organization.logo_storage_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt="Organization logo"
            className="h-20 w-20 rounded-md object-cover"
            src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/bandjoes-assets/${settings.organization.logo_storage_path}`}
          />
        ) : null}

        <button
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={isSaving}
          onClick={saveSettings}
          type="button"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </section>

      <section className="space-y-3 rounded-xl border border-stone-300 bg-white p-4">
        <h2 className="text-base font-semibold text-stone-900">Section 2 — Account & Team Settings</h2>

        <form className="grid gap-2 sm:grid-cols-[1fr_140px_140px]" onSubmit={inviteMember}>
          <input
            className="rounded-md border border-stone-300 px-3 py-2 text-sm"
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="member@company.com"
            required
            type="email"
            value={inviteEmail}
          />
          <select
            className="rounded-md border border-stone-300 px-3 py-2 text-sm"
            onChange={(event) => setInviteRole(event.target.value as TeamRole)}
            value={inviteRole}
          >
            <option value="admin">admin</option>
            <option value="editor">editor</option>
            <option value="viewer">viewer</option>
          </select>
          <button
            className="rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={isInviting}
            type="submit"
          >
            {isInviting ? "Inviting..." : "Invite"}
          </button>
        </form>

        <div className="space-y-2">
          {settings.teamMembers.map((member) => (
            <div
              className="grid gap-2 rounded-md border border-stone-200 p-3 sm:grid-cols-[1fr_120px_100px_100px]"
              key={member.id}
            >
              <div>
                <p className="text-sm font-medium text-stone-900">{member.email ?? member.user_id}</p>
                <p className="text-xs text-stone-500">User ID: {member.user_id}</p>
              </div>

              <select
                className="rounded-md border border-stone-300 px-2 py-1 text-sm"
                onChange={(event) =>
                  setTeamRoleDrafts((current) => ({
                    ...current,
                    [member.id]: event.target.value as TeamRole
                  }))
                }
                value={teamRoleDrafts[member.id] ?? member.role}
              >
                <option value="admin">admin</option>
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>

              <button
                className="rounded-md border border-stone-300 px-3 py-1 text-sm"
                onClick={() => {
                  void updateMemberRole(member.id);
                }}
                type="button"
              >
                Update
              </button>

              <button
                className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-700"
                onClick={() => {
                  void removeMember(member.id);
                }}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}

          {settings.teamMembers.length === 0 ? (
            <p className="text-sm text-stone-600">No team members found.</p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-stone-300 bg-white p-4">
        <h2 className="text-base font-semibold text-stone-900">Section 3 — Model API Configuration</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-stone-700">
            Provider
            <select
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
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

          <label className="text-sm text-stone-700">
            Model
            <input
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              onChange={(event) =>
                setApiForm((current) => ({ ...current, model: event.target.value }))
              }
              value={apiForm.model}
            />
          </label>

          <label className="text-sm text-stone-700">
            API Key
            <input
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              onChange={(event) =>
                setApiForm((current) => ({ ...current, apiKey: event.target.value }))
              }
              placeholder="Leave blank to keep existing key"
              type="password"
              value={apiForm.apiKey}
            />
          </label>

          <label className="text-sm text-stone-700">
            Default image size
            <input
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
              onChange={(event) =>
                setApiForm((current) => ({ ...current, defaultImageSize: event.target.value }))
              }
              value={apiForm.defaultImageSize}
            />
          </label>

          <label className="text-sm text-stone-700 sm:col-span-2">
            JSON advanced params
            <textarea
              className="mt-1 min-h-28 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm"
              onChange={(event) =>
                setApiForm((current) => ({ ...current, defaultParams: event.target.value }))
              }
              value={apiForm.defaultParams}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={isSaving}
            onClick={saveSettings}
            type="button"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>

          <button
            className="rounded-md border border-stone-300 px-4 py-2 text-sm"
            disabled={isTesting}
            onClick={testConnection}
            type="button"
          >
            {isTesting ? "Testing..." : "Test Connection"}
          </button>

          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              settings.apiSettings.configured
                ? "bg-emerald-100 text-emerald-700"
                : "bg-stone-200 text-stone-700"
            }`}
          >
            {settings.apiSettings.configured ? "Configured" : "Not Configured"}
          </span>
        </div>

        {testMessage ? <p className="text-sm text-stone-700">{testMessage}</p> : null}
      </section>

      <section className="space-y-2 rounded-xl border border-stone-300 bg-white p-4">
        <h2 className="text-base font-semibold text-stone-900">Section 4 — Usage & Limits (Future-Ready)</h2>
        <p className="text-sm text-stone-700">Month: {settings.usage.month}</p>
        <p className="text-sm text-stone-700">Images generated: {settings.usage.images_generated}</p>
        <p className="text-sm text-stone-700">Storage used (MB): {settings.usage.storage_used_mb}</p>
        <p className="text-sm text-stone-700">API calls: {settings.usage.api_calls}</p>
      </section>

      <section className="space-y-2 rounded-xl border border-stone-300 bg-white p-4">
        <h2 className="text-base font-semibold text-stone-900">Section 5 — Security & Environment</h2>
        <p className="text-sm text-stone-700">
          Supabase connected: {settings.security.supabaseConnected ? "Yes" : "No"}
        </p>
        <p className="text-sm text-stone-700">
          Storage bucket connected: {settings.security.storageBucketConnected ? "Yes" : "No"}
        </p>
        <p className="text-sm text-stone-700">
          Model API configured: {settings.security.modelApiConfigured ? "Yes" : "No"}
        </p>
        <p className="text-sm text-stone-700">
          Last settings update: {new Date(settings.security.lastSettingsUpdate).toLocaleString()}
        </p>
        <p className="text-sm text-stone-700">App version: {settings.security.appVersion}</p>
      </section>
    </main>
  );
}
