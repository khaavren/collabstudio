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

const PROVIDER_OPTIONS = [
  "OpenAI",
  "Anthropic",
  "Google Gemini",
  "Replicate",
  "Stability AI",
  "Custom HTTP"
] as const;

const PROVIDER_LABELS: Record<(typeof PROVIDER_OPTIONS)[number], string> = {
  OpenAI: "OpenAI",
  Anthropic: "Anthropic (Claude)",
  "Google Gemini": "Google Gemini",
  Replicate: "Replicate",
  "Stability AI": "Stability AI",
  "Custom HTTP": "Custom HTTP"
};

type ApiTestResponse = {
  ok?: boolean;
  status?: string;
  message?: string;
  provider?: string;
  model?: string;
  models?: string[];
  error?: string;
};

type AdminTab = "organization" | "account" | "developer" | "model" | "usage" | "security";
type DeveloperUserRow = AdminSettingsResponse["developerDashboard"]["users"][number];
type DeveloperRoleFilter = "all" | TeamRole | "none";
const WORKSPACE_PATH = "/";

function recommendedModelsForProvider(provider: string) {
  const normalizedProvider = normalizeProviderValue(provider);

  if (normalizedProvider === "OpenAI") {
    return [
      "gpt-image-1",
      "gpt-5.2",
      "gpt-5.2-mini",
      "gpt-5",
      "gpt-5-mini",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4o-mini",
      "o3",
      "o4-mini"
    ];
  }

  if (normalizedProvider === "Anthropic") {
    return [
      "claude-opus-4-1",
      "claude-opus-4",
      "claude-sonnet-4",
      "claude-3-7-sonnet-latest",
      "claude-3-5-sonnet-latest",
      "claude-3-5-haiku-latest"
    ];
  }

  if (normalizedProvider === "Google Gemini") {
    return ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"];
  }

  if (normalizedProvider === "Replicate") {
    return [
      "black-forest-labs/flux-schnell",
      "black-forest-labs/flux-dev",
      "stability-ai/sdxl",
      "stability-ai/stable-diffusion"
    ];
  }

  if (normalizedProvider === "Stability AI") {
    return ["stable-image-core", "stable-image-ultra", "sd3", "sdxl"];
  }

  return [];
}

function pickLatestCurrentModels(provider: string, models: string[]) {
  const normalizedProvider = normalizeProviderValue(provider);
  const recommended = recommendedModelsForProvider(normalizedProvider);
  const uniqueModels = Array.from(new Set(models.filter((entry) => entry.trim().length > 0)));

  const openAiPreferred = [
    "gpt-image-1",
    "gpt-5.2",
    "gpt-5.2-mini",
    "gpt-5",
    "gpt-5-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4o",
    "gpt-4o-mini",
    "o3",
    "o4-mini"
  ];

  const anthropicPreferred = [
    "claude-opus-4-1",
    "claude-opus-4",
    "claude-sonnet-4",
    "claude-3-7-sonnet-latest",
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-latest"
  ];

  const geminiPreferred = [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash"
  ];

  const includesAny = (value: string, parts: string[]) => {
    const lowered = value.toLowerCase();
    return parts.some((part) => lowered.includes(part));
  };

  if (normalizedProvider === "OpenAI") {
    const curated = recommended.filter((model) =>
      openAiPreferred.some((candidate) => model === candidate || model.startsWith(`${candidate}-`))
    );
    return curated.slice(0, 12);
  }

  if (normalizedProvider === "Anthropic") {
    const preferred = [...recommended, ...uniqueModels].filter((model) =>
      anthropicPreferred.some((candidate) => model === candidate || model.startsWith(`${candidate}-`))
    );
    if (preferred.length > 0) return preferred.slice(0, 12);

    return uniqueModels
      .filter((model) => model.startsWith("claude-"))
      .filter((model) => !includesAny(model, ["instant", "legacy"]))
      .slice(0, 12);
  }

  if (normalizedProvider === "Google Gemini") {
    const preferred = [...recommended, ...uniqueModels].filter((model) =>
      geminiPreferred.some((candidate) => model === candidate || model.startsWith(`${candidate}-`))
    );
    if (preferred.length > 0) return preferred.slice(0, 12);

    return uniqueModels
      .filter((model) => includesAny(model, ["gemini-2.5", "gemini-2.0", "gemini-1.5"]))
      .filter((model) => !includesAny(model, ["embedding", "aqa", "vision"]))
      .slice(0, 12);
  }

  if (normalizedProvider === "Replicate") {
    return [...recommended, ...uniqueModels]
      .filter((model) => includesAny(model, ["flux", "sdxl", "stable", "imagen"]))
      .slice(0, 12);
  }

  if (normalizedProvider === "Stability AI") {
    return [...recommended, ...uniqueModels]
      .filter((model) => includesAny(model, ["stable-image", "sd3", "sdxl", "ultra", "core"]))
      .slice(0, 12);
  }

  return [...recommended, ...uniqueModels].slice(0, 12);
}

function buildModelOptions(provider: string, discoveredModels: string[], selectedModel: string) {
  const shortlist = pickLatestCurrentModels(provider, discoveredModels);
  const selected = selectedModel.trim();

  if (!selected) return shortlist;
  if (shortlist.includes(selected)) return shortlist;

  return [selected, ...shortlist];
}

function normalizeProviderValue(value: string) {
  const raw = value.trim().toLowerCase();
  if (!raw) return "OpenAI";
  if (raw === "stability") return "Stability AI";
  if (raw === "claude" || raw === "anthropic (claude)") return "Anthropic";
  return PROVIDER_OPTIONS.find((entry) => entry.toLowerCase() === raw) ?? value;
}

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

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
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
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [discoveredModelCount, setDiscoveredModelCount] = useState(0);
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);
  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  const [settings, setSettings] = useState<AdminSettingsResponse | null>(null);
  const [orgForm, setOrgForm] = useState(EMPTY_ORG_FORM);
  const [apiForm, setApiForm] = useState(EMPTY_API_FORM);
  const [teamRoleDrafts, setTeamRoleDrafts] = useState<Record<string, TeamRole>>({});
  const [teamNameDrafts, setTeamNameDrafts] = useState<Record<string, string>>({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("viewer");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("organization");
  const [developerSearch, setDeveloperSearch] = useState("");
  const [developerRoleFilter, setDeveloperRoleFilter] = useState<DeveloperRoleFilter>("all");
  const [developerRoleDrafts, setDeveloperRoleDrafts] = useState<Record<string, TeamRole>>({});
  const [userActionInFlight, setUserActionInFlight] = useState<string | null>(null);
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

    const providerValue = normalizeProviderValue(nextSettings.apiSettings.provider || "OpenAI");
    const modelValue = nextSettings.apiSettings.model || "";

    setApiForm({
      provider: providerValue,
      model: nextSettings.apiSettings.model || "",
      apiKey: "",
      defaultImageSize: nextSettings.apiSettings.defaultImageSize || "1024x1024",
      defaultParams: JSON.stringify(nextSettings.apiSettings.defaultParams ?? {}, null, 2)
    });
    setModelOptions(buildModelOptions(providerValue, [], modelValue));
    setDiscoveredModelCount(0);
    setHasStoredApiKey(Boolean(nextSettings.apiSettings.configured));
    setIsEditingApiKey(false);

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
    setDeveloperRoleDrafts(
      Object.fromEntries(
        nextSettings.developerDashboard.users.map((entry) => [entry.userId, entry.employeeRole ?? "viewer"])
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

  const developerUsers = settings?.developerDashboard.users ?? [];
  const filteredDeveloperUsers = useMemo(() => {
    const searchValue = developerSearch.trim().toLowerCase();

    return developerUsers.filter((entry) => {
      const matchesSearch =
        searchValue.length === 0 ||
        String(entry.email ?? "")
          .toLowerCase()
          .includes(searchValue) ||
        String(entry.displayName ?? "")
          .toLowerCase()
          .includes(searchValue) ||
        entry.userId.toLowerCase().includes(searchValue);

      const matchesRole =
        developerRoleFilter === "all"
          ? true
          : developerRoleFilter === "none"
            ? !entry.isEmployee
            : entry.employeeRole === developerRoleFilter;

      return matchesSearch && matchesRole;
    });
  }, [developerRoleFilter, developerSearch, developerUsers]);

  function ensureAdminAccess() {
    if (!settings?.access.isAdmin) {
      setError("Admin role is required for this action.");
      return false;
    }

    return true;
  }

  async function saveSettings() {
    if (!ensureAdminAccess()) return;
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

      setApiForm((current) => ({ ...current, apiKey: "" }));
      setIsEditingApiKey(false);
      setLogoFile(null);
      setMessage("Settings saved.");
      await loadSettings();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save settings.");
    } finally {
      setIsSaving(false);
    }
  }

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const email = adminEmail.trim().toLowerCase();
    const password = adminPassword;

    if (!email || !password.trim()) {
      setError("Email and password are required.");
      return;
    }

    setIsSigningIn(true);
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (session?.user?.is_anonymous) {
        await supabase.auth.signOut();
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        setError(signInError.message || "Unable to sign in.");
        return;
      }

      if (!data.session?.access_token) {
        setError("Signed in, but no session was established. Please try again.");
        return;
      }

      setAdminPassword("");
      setMessage("Signed in.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setIsSigningIn(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSettings(null);
    setIsUnauthorized(false);
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ensureAdminAccess()) return;

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
    if (!ensureAdminAccess()) return;
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
    if (!ensureAdminAccess()) return;
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

  async function grantEmployeeAccess(entry: DeveloperUserRow) {
    if (!ensureAdminAccess()) return;
    if (!entry.email) {
      setError("User email unavailable. Cannot grant employee access.");
      return;
    }

    setUserActionInFlight(entry.userId);
    setError(null);
    setMessage(null);

    try {
      const role = developerRoleDrafts[entry.userId] ?? "viewer";
      const response = await fetchWithAuth("/api/admin/team/invite", {
        method: "POST",
        body: JSON.stringify({
          email: entry.email,
          role
        })
      });

      const payload = await safeJson<{ message?: string; error?: string }>(response, "Unable to grant access.");
      if (!response.ok) {
        setError(payload.error ?? "Unable to grant access.");
        return;
      }

      setMessage(payload.message ?? "Employee access granted.");
      await loadSettings();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to grant access.");
    } finally {
      setUserActionInFlight(null);
    }
  }

  async function updateDeveloperMember(entry: DeveloperUserRow) {
    if (!ensureAdminAccess()) return;
    if (!entry.teamMemberId) return;

    setUserActionInFlight(entry.userId);
    setError(null);
    setMessage(null);

    try {
      const role = developerRoleDrafts[entry.userId] ?? entry.employeeRole ?? "viewer";
      const response = await fetchWithAuth(`/api/admin/team/${entry.teamMemberId}`, {
        method: "PATCH",
        body: JSON.stringify({
          role,
          displayName: entry.displayName ?? ""
        })
      });

      const payload = await safeJson<{ error?: string }>(response, "Unable to update employee role.");
      if (!response.ok) {
        setError(payload.error ?? "Unable to update employee role.");
        return;
      }

      setMessage("Employee role updated.");
      await loadSettings();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update employee role.");
    } finally {
      setUserActionInFlight(null);
    }
  }

  async function revokeEmployeeAccess(entry: DeveloperUserRow) {
    if (!ensureAdminAccess()) return;
    if (!entry.teamMemberId) return;

    setUserActionInFlight(entry.userId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetchWithAuth(`/api/admin/team/${entry.teamMemberId}`, {
        method: "DELETE"
      });

      const payload = await safeJson<{ error?: string }>(response, "Unable to revoke access.");
      if (!response.ok) {
        setError(payload.error ?? "Unable to revoke access.");
        return;
      }

      setMessage("Employee access revoked.");
      await loadSettings();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to revoke access.");
    } finally {
      setUserActionInFlight(null);
    }
  }

  async function testConnection() {
    if (!ensureAdminAccess()) return;
    setIsTesting(true);
    setTestMessage(null);
    try {
      const response = await fetchWithAuth("/api/admin/test", {
        method: "POST",
        body: JSON.stringify({
          provider: apiForm.provider,
          model: apiForm.model,
          apiKey: apiForm.apiKey
        })
      });

      const payload = await safeJson<ApiTestResponse>(
        response,
        "Connection test failed."
      );

      if (!response.ok) {
        setTestMessage(payload.error ?? "Connection test failed.");
        return;
      }

      const nextModels = Array.isArray(payload.models)
        ? payload.models.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        : [];
      setDiscoveredModelCount(nextModels.length);
      const selectedModel = (payload.model ?? apiForm.model).trim();
      setModelOptions(buildModelOptions(apiForm.provider, nextModels, selectedModel));

      if (payload.model) {
        setApiForm((current) => ({
          ...current,
          model: current.model.trim().length > 0 ? current.model : payload.model ?? current.model
        }));
      }

      setTestMessage(payload.message ?? "Connection test complete.");
    } catch (caught) {
      setTestMessage(caught instanceof Error ? caught.message : "Connection test failed.");
    } finally {
      setIsTesting(false);
    }
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
            Sign in with your owner or employee email and password to access /admin.
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

          <form className="space-y-3" onSubmit={signInWithPassword}>
            <input
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              disabled={isSigningIn}
              onChange={(event) => setAdminEmail(event.target.value)}
              placeholder="admin@company.com"
              type="email"
              value={adminEmail}
            />
            <input
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              disabled={isSigningIn}
              onChange={(event) => setAdminPassword(event.target.value)}
              placeholder="Password"
              type="password"
              value={adminPassword}
            />
            <div className="flex justify-end">
              <Link className="text-xs text-[var(--muted-foreground)] hover:underline" to="/forgot-password">
                Forgot password?
              </Link>
            </div>
            <button
              className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={isSigningIn}
              type="submit"
            >
              {isSigningIn ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <Link className="block text-sm text-[var(--muted-foreground)] hover:underline" to={WORKSPACE_PATH}>
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
            <Link className="text-[var(--muted-foreground)] hover:underline" to={WORKSPACE_PATH}>
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
  const canManageAdminSettings = settings.access.isAdmin;
  const tabs: Array<{ id: AdminTab; label: string }> = [
    { id: "organization", label: "Organization Profile" },
    { id: "account", label: "Account & Team" },
    { id: "developer", label: "Developer Users & Usage" },
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
              to={WORKSPACE_PATH}
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
            <p className="mt-1 text-sm text-slate-500">
              Studio administration only. Personal account details are managed in{" "}
              <Link className="font-medium text-slate-700 underline" to="/settings/profile">
                Profile Settings
              </Link>
              .
            </p>
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
            {!canManageAdminSettings ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                You are signed in as <span className="font-semibold">{settings.access.role}</span>. Monitoring is
                available, but management actions require admin role.
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
                        className="mx-auto inline-flex w-full max-w-[220px] items-center justify-center gap-2 rounded-md bg-[#2b66d5] px-4 py-2 text-lg font-semibold text-white transition hover:bg-[#2457b5] disabled:opacity-60"
                        disabled={!canManageAdminSettings}
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
                    disabled={isSaving || !canManageAdminSettings}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void saveSettings();
                    }}
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
                      disabled={!canManageAdminSettings}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="member@company.com"
                      required
                      type="email"
                      value={inviteEmail}
                    />
                    <select
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-lg"
                      disabled={!canManageAdminSettings}
                      onChange={(event) => setInviteRole(event.target.value as TeamRole)}
                      value={inviteRole}
                    >
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      className="rounded-md bg-[#2b66d5] px-4 py-2 text-lg font-semibold text-white transition hover:bg-[#2457b5] disabled:opacity-60"
                      disabled={isInviting || !canManageAdminSettings}
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
                                  disabled={!canManageAdminSettings}
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
                                  disabled={!canManageAdminSettings}
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
                                  className="text-[#2b66d5] hover:underline disabled:opacity-50"
                                  disabled={!canManageAdminSettings}
                                  onClick={() => {
                                    void updateMember(member.id);
                                  }}
                                  type="button"
                                >
                                  Save
                                </button>
                                <button
                                  className="text-[#2b66d5] hover:underline disabled:opacity-50"
                                  disabled={!canManageAdminSettings}
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

            {activeTab === "developer" ? (
              <section className="space-y-4 rounded-lg border border-slate-300 bg-[#f8f9fb] p-5">
                <div className="space-y-1">
                  <h2 className="text-2xl font-semibold text-[#243042]">Developer Users & Usage</h2>
                  <p className="text-sm text-slate-500">
                    Monitor all app users, activity, and employee access from one place.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-md border border-slate-300 bg-white p-4">
                    <p className="text-sm uppercase tracking-wide text-slate-500">Total Users</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-800">
                      {settings.developerDashboard.summary.totalUsers}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-300 bg-white p-4">
                    <p className="text-sm uppercase tracking-wide text-slate-500">Active (30d)</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-800">
                      {settings.developerDashboard.summary.activeUsers30d}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-300 bg-white p-4">
                    <p className="text-sm uppercase tracking-wide text-slate-500">Employees</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-800">
                      {settings.developerDashboard.summary.employeeUsers}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-300 bg-white p-4">
                    <p className="text-sm uppercase tracking-wide text-slate-500">Inactive Users</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-800">
                      {settings.developerDashboard.summary.inactiveUsers}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-md border border-slate-300 bg-white p-4">
                    <p className="text-sm uppercase tracking-wide text-slate-500">Workspaces</p>
                    <p className="mt-2 text-xl font-semibold text-slate-800">
                      {settings.developerDashboard.totals.workspaces}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-300 bg-white p-4">
                    <p className="text-sm uppercase tracking-wide text-slate-500">Workspace Collaborators</p>
                    <p className="mt-2 text-xl font-semibold text-slate-800">
                      {settings.developerDashboard.totals.workspaceCollaborators}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-300 bg-white p-4">
                    <p className="text-sm uppercase tracking-wide text-slate-500">Rooms</p>
                    <p className="mt-2 text-xl font-semibold text-slate-800">
                      {settings.developerDashboard.totals.rooms}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-300 bg-white p-4">
                    <p className="text-sm uppercase tracking-wide text-slate-500">Assets</p>
                    <p className="mt-2 text-xl font-semibold text-slate-800">
                      {settings.developerDashboard.totals.assets}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-300 bg-white p-4">
                    <p className="text-sm uppercase tracking-wide text-slate-500">Asset Versions</p>
                    <p className="mt-2 text-xl font-semibold text-slate-800">
                      {settings.developerDashboard.totals.assetVersions}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-300 bg-white p-4">
                    <p className="text-sm uppercase tracking-wide text-slate-500">Comments</p>
                    <p className="mt-2 text-xl font-semibold text-slate-800">
                      {settings.developerDashboard.totals.comments}
                    </p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-[minmax(240px,1fr)_220px]">
                  <input
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    onChange={(event) => setDeveloperSearch(event.target.value)}
                    placeholder="Search user by email, name, or user id"
                    value={developerSearch}
                  />
                  <select
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    onChange={(event) => setDeveloperRoleFilter(event.target.value as DeveloperRoleFilter)}
                    value={developerRoleFilter}
                  >
                    <option value="all">All users</option>
                    <option value="none">Not employees</option>
                    <option value="admin">Employees: Admin</option>
                    <option value="editor">Employees: Editor</option>
                    <option value="viewer">Employees: Viewer</option>
                  </select>
                </div>

                <div className="overflow-x-auto rounded-md border border-slate-300 bg-white">
                  <table className="w-full min-w-[1180px] text-left">
                    <thead className="border-b border-slate-300 bg-[#f1f4f8] text-sm text-slate-600">
                      <tr>
                        <th className="px-4 py-2 font-semibold">User</th>
                        <th className="px-4 py-2 font-semibold">Last Sign In</th>
                        <th className="px-4 py-2 font-semibold">Workspace Usage</th>
                        <th className="px-4 py-2 font-semibold">Employee Access</th>
                        <th className="px-4 py-2 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeveloperUsers.length === 0 ? (
                        <tr>
                          <td className="px-4 py-6 text-sm text-slate-500" colSpan={5}>
                            No users match the current filter.
                          </td>
                        </tr>
                      ) : (
                        filteredDeveloperUsers.map((entry) => {
                          const isBusy = userActionInFlight === entry.userId;
                          const isSelf = entry.userId === user.id;
                          const currentRole = developerRoleDrafts[entry.userId] ?? entry.employeeRole ?? "viewer";
                          const accountStatusClass =
                            entry.accountStatus === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : entry.accountStatus === "idle"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-200 text-slate-700";

                          return (
                            <tr className="border-b border-slate-200 last:border-b-0" key={entry.userId}>
                              <td className="space-y-1 px-4 py-3">
                                <p className="font-semibold text-slate-800">
                                  {entry.displayName ?? entry.email ?? "Unknown user"}
                                </p>
                                <p className="text-sm text-slate-600">{entry.email ?? "Email unavailable"}</p>
                                <p className="text-xs text-slate-500">User ID: {entry.userId}</p>
                                <p className="text-xs text-slate-500">Joined: {formatDateTime(entry.createdAt)}</p>
                              </td>
                              <td className="space-y-1 px-4 py-3 text-sm text-slate-700">
                                <p>{formatDateTime(entry.lastSignInAt)}</p>
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${accountStatusClass}`}>
                                  {entry.accountStatus === "never" ? "Never signed in" : entry.accountStatus}
                                </span>
                              </td>
                              <td className="space-y-1 px-4 py-3 text-sm text-slate-700">
                                <p>Owned: {entry.ownedWorkspaceCount}</p>
                                <p>Collaborator: {entry.collaboratorWorkspaceCount}</p>
                                <p>Total: {entry.totalWorkspaceCount}</p>
                                <p className="text-xs text-slate-500">
                                  Last workspace activity: {formatDateTime(entry.lastWorkspaceActivityAt)}
                                </p>
                              </td>
                              <td className="space-y-2 px-4 py-3">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                    entry.isEmployee ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-700"
                                  }`}
                                >
                                  {entry.isEmployee ? `Employee (${entry.employeeRole})` : "No employee access"}
                                </span>
                                <select
                                  className="block w-full max-w-[180px] rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                                  disabled={!canManageAdminSettings}
                                  onChange={(event) =>
                                    setDeveloperRoleDrafts((current) => ({
                                      ...current,
                                      [entry.userId]: event.target.value as TeamRole
                                    }))
                                  }
                                  value={currentRole}
                                >
                                  <option value="admin">Admin</option>
                                  <option value="editor">Editor</option>
                                  <option value="viewer">Viewer</option>
                                </select>
                              </td>
                              <td className="space-x-3 px-4 py-3 text-sm">
                                {entry.isEmployee ? (
                                  <>
                                    <button
                                      className="text-[#2b66d5] hover:underline disabled:opacity-60"
                                      disabled={isBusy || !canManageAdminSettings}
                                      onClick={() => {
                                        void updateDeveloperMember(entry);
                                      }}
                                      type="button"
                                    >
                                      {isBusy ? "Saving..." : "Update role"}
                                    </button>
                                    <button
                                      className="text-[#2b66d5] hover:underline disabled:opacity-60"
                                      disabled={isBusy || isSelf || !canManageAdminSettings}
                                      onClick={() => {
                                        void revokeEmployeeAccess(entry);
                                      }}
                                      type="button"
                                    >
                                      Revoke access
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    className="text-[#2b66d5] hover:underline disabled:opacity-60"
                                    disabled={isBusy || !entry.email || !canManageAdminSettings}
                                    onClick={() => {
                                      void grantEmployeeAccess(entry);
                                    }}
                                    type="button"
                                  >
                                    {isBusy ? "Granting..." : "Grant access"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
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
                      disabled={!canManageAdminSettings}
                      onChange={(event) => {
                        const nextProvider = event.target.value;
                        const fallbackModels = buildModelOptions(nextProvider, [], "");
                        setApiForm((current) => ({
                          ...current,
                          provider: nextProvider,
                          model: current.model.trim().length > 0 ? current.model : fallbackModels[0] ?? ""
                        }));
                        setModelOptions(fallbackModels);
                        setDiscoveredModelCount(0);
                        setTestMessage(null);
                      }}
                      value={apiForm.provider}
                    >
                      {PROVIDER_OPTIONS.map((provider) => (
                        <option key={provider} value={provider}>
                          {PROVIDER_LABELS[provider]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-lg font-medium text-slate-700">
                    Model Name
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-lg"
                      disabled={!canManageAdminSettings}
                      onChange={(event) => setApiForm((current) => ({ ...current, model: event.target.value }))}
                      placeholder="Enter model name or choose from discovered list"
                      value={apiForm.model}
                    />
                    {modelOptions.length > 0 ? (
                      <select
                        className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base font-normal"
                        disabled={!canManageAdminSettings}
                        onChange={(event) =>
                          setApiForm((current) => ({
                            ...current,
                            model: event.target.value
                          }))
                        }
                        value={apiForm.model}
                      >
                        {modelOptions.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <p className="mt-1 text-sm font-normal text-slate-500">
                      {modelOptions.length > 0
                        ? discoveredModelCount > 0
                          ? discoveredModelCount > modelOptions.length
                            ? `Discovered ${discoveredModelCount} models. Showing ${modelOptions.length} latest current models.`
                            : `Discovered ${discoveredModelCount} models. Showing ${modelOptions.length} curated options.`
                          : `Showing ${modelOptions.length} curated model options.`
                        : "Run Test Connection after entering API key to discover available models."}
                    </p>
                  </label>

                  <label className="text-lg font-medium text-slate-700">
                    API Key
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-lg"
                      disabled={!canManageAdminSettings}
                      onBlur={() => {
                        if (hasStoredApiKey && isEditingApiKey && apiForm.apiKey.trim().length === 0) {
                          setIsEditingApiKey(false);
                        }
                      }}
                      onChange={(event) => {
                        if (hasStoredApiKey && !isEditingApiKey) {
                          setIsEditingApiKey(true);
                        }
                        setApiForm((current) => ({ ...current, apiKey: event.target.value }));
                      }}
                      onFocus={() => {
                        if (hasStoredApiKey && !isEditingApiKey) {
                          setIsEditingApiKey(true);
                        }
                      }}
                      placeholder={
                        hasStoredApiKey && !isEditingApiKey ? "" : "Enter API key (leave blank to keep existing)"
                      }
                      type={hasStoredApiKey && !isEditingApiKey ? "text" : "password"}
                      value={
                        hasStoredApiKey && !isEditingApiKey ? "••••••••••••••••••••••••••••••••" : apiForm.apiKey
                      }
                    />
                    <p className="mt-1 text-sm font-normal text-slate-500">
                      {hasStoredApiKey
                        ? isEditingApiKey
                          ? "Enter a new key to replace the saved key."
                          : "A key is saved. Click to replace it."
                        : "No key saved yet."}
                    </p>
                  </label>

                  <label className="text-lg font-medium text-slate-700">
                    Default Image Size
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-lg"
                      disabled={!canManageAdminSettings}
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
                      disabled={!canManageAdminSettings}
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
                    disabled={isSaving || !canManageAdminSettings}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void saveSettings();
                    }}
                    type="button"
                  >
                    {isSaving ? "Saving..." : "Save Configuration"}
                  </button>
                  <button
                    className="rounded-md border border-slate-300 bg-white px-5 py-2 text-lg text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    disabled={isTesting || !canManageAdminSettings}
                    onClick={testConnection}
                    type="button"
                  >
                    {isTesting ? "Testing..." : "Test Connection & Discover Models"}
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
