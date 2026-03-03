import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, LayoutDashboard, Upload, UserCircle2, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/auth-context";
import { SiteTopNav } from "@/components/SiteTopNav";
import { fetchWithAuth } from "@/lib/admin";

const API_ONBOARDING_DEFER_KEY = "api_key_onboarding_deferred_until";
const API_ONBOARDING_DEFER_MS = 24 * 60 * 60 * 1000;
const PROVIDER_OPTIONS = ["OpenAI", "Anthropic", "Google Gemini", "Replicate", "Stability AI", "Custom HTTP"];
const IMAGE_SIZE_OPTIONS = ["512x512", "1024x1024", "1536x1536", "1792x1024", "1024x1792"];

type MessageTone = "success" | "error";

type ProfileSettingsPayload = {
  profile?: {
    organizationId?: string | null;
  };
  access?: {
    isAdmin?: boolean;
  };
  apiSettings?: {
    provider?: string;
    model?: string;
    defaultImageSize?: string;
    defaultParams?: Record<string, unknown>;
    configured?: boolean;
    hasStoredApiKey?: boolean;
  };
  error?: string;
};

function messageToneClass(tone: MessageTone | null) {
  if (tone === "error") {
    return "border border-[#e8cfc6] bg-[#fff4f0] text-[#9d4d3d]";
  }
  return "border border-emerald-200 bg-emerald-50 text-emerald-700";
}

function parsePayloadError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const message = String((payload as { error?: string }).error ?? "").trim();
    if (message.length > 0) {
      return message;
    }
  }
  return fallback;
}

function toPrettyJson(value: Record<string, unknown> | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "{}";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

export function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const apiSectionRef = useRef<HTMLElement>(null);
  const { changePassword, isAuthenticated, updateUser, user } = useAuth();

  const [displayName, setDisplayName] = useState(user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileMessageTone, setProfileMessageTone] = useState<MessageTone | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordMessageTone, setPasswordMessageTone] = useState<MessageTone | null>(null);
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);
  const [workspaceMessageTone, setWorkspaceMessageTone] = useState<MessageTone | null>(null);
  const [isLoadingWorkspaceSettings, setIsLoadingWorkspaceSettings] = useState(true);
  const [isSavingWorkspaceSettings, setIsSavingWorkspaceSettings] = useState(false);
  const [hasOrganizationMembership, setHasOrganizationMembership] = useState(false);
  const [canAccessDeveloperDashboard, setCanAccessDeveloperDashboard] = useState(false);
  const [apiConfigured, setApiConfigured] = useState(false);
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);
  const [provider, setProvider] = useState("OpenAI");
  const [model, setModel] = useState("");
  const [defaultImageSize, setDefaultImageSize] = useState("1024x1024");
  const [defaultParams, setDefaultParams] = useState("{}");
  const [apiKey, setApiKey] = useState("");

  const searchParams = new URLSearchParams(location.search);
  const onboardingMode = searchParams.get("onboarding") === "1";
  const focusApiSection = searchParams.get("tab") === "api";

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    setDisplayName(user?.name ?? "");
    setAvatarUrl(user?.avatarUrl ?? null);
  }, [user]);

  useEffect(() => {
    if (!focusApiSection) return;
    window.setTimeout(() => {
      apiSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }, [focusApiSection]);

  useEffect(() => {
    let active = true;

    async function loadWorkspaceSettings() {
      if (!isAuthenticated) {
        if (!active) return;
        setIsLoadingWorkspaceSettings(false);
        return;
      }

      setIsLoadingWorkspaceSettings(true);
      try {
        const response = await fetchWithAuth("/api/profile", { method: "GET" });
        const payload = (await response.json().catch(() => ({}))) as ProfileSettingsPayload;

        if (!active) return;
        if (!response.ok) {
          throw new Error(parsePayloadError(payload, "Unable to load workspace settings."));
        }

        setHasOrganizationMembership(Boolean(payload.profile?.organizationId));
        setCanAccessDeveloperDashboard(Boolean(payload.access?.isAdmin));
        const apiSettings = payload.apiSettings ?? {};
        const nextProvider = String(apiSettings.provider ?? "").trim();
        setProvider(nextProvider.length > 0 ? nextProvider : "OpenAI");
        setModel(String(apiSettings.model ?? ""));
        setDefaultImageSize(String(apiSettings.defaultImageSize ?? "1024x1024"));
        setDefaultParams(toPrettyJson(apiSettings.defaultParams));
        setApiConfigured(Boolean(apiSettings.configured));
        setHasStoredApiKey(Boolean(apiSettings.hasStoredApiKey || apiSettings.configured));
      } catch (caught) {
        if (!active) return;
        setWorkspaceMessage(caught instanceof Error ? caught.message : "Unable to load workspace settings.");
        setWorkspaceMessageTone("error");
      } finally {
        if (!active) return;
        setIsLoadingWorkspaceSettings(false);
      }
    }

    void loadWorkspaceSettings();
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

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
    setProfileMessage(null);
    setProfileMessageTone(null);

    try {
      const selectedAvatar =
        typeof avatarUrl === "string" && avatarUrl.startsWith("data:") ? null : avatarUrl;
      await updateUser({
        name: displayName.trim() || (user?.email?.split("@")[0] ?? "Member"),
        avatarUrl: selectedAvatar
      });
      if (selectedAvatar === null && typeof avatarUrl === "string" && avatarUrl.startsWith("data:")) {
        setAvatarUrl(null);
        setProfileMessage("Profile updated. Avatar file uploads are not supported yet.");
      } else {
        setProfileMessage("Profile updated.");
      }
      setProfileMessageTone("success");
    } catch (caught) {
      setProfileMessage(caught instanceof Error ? caught.message : "Unable to update profile.");
      setProfileMessageTone("error");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUpdatingPassword(true);
    setPasswordMessage(null);
    setPasswordMessageTone(null);

    try {
      const cleanPassword = newPassword.trim();
      const cleanConfirmation = confirmPassword.trim();
      if (!cleanPassword || !cleanConfirmation) {
        throw new Error("Enter and confirm your new password.");
      }
      if (cleanPassword !== cleanConfirmation) {
        throw new Error("Passwords do not match.");
      }

      await changePassword(cleanPassword);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated.");
      setPasswordMessageTone("success");
    } catch (caught) {
      setPasswordMessage(caught instanceof Error ? caught.message : "Unable to update password.");
      setPasswordMessageTone("error");
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  async function handleWorkspaceSettingsSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingWorkspaceSettings(true);
    setWorkspaceMessage(null);
    setWorkspaceMessageTone(null);

    try {
      if (!hasOrganizationMembership) {
        throw new Error("Workspace settings are unavailable for this account.");
      }

      const parsedDefaultParams = (() => {
        const trimmed = defaultParams.trim();
        if (!trimmed) return {};
        const parsed = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Default params must be a JSON object.");
        }
        return parsed as Record<string, unknown>;
      })();

      const response = await fetchWithAuth("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          apiSettings: {
            provider,
            model,
            defaultImageSize,
            defaultParams: parsedDefaultParams,
            apiKey
          }
        })
      });
      const payload = (await response.json().catch(() => ({}))) as ProfileSettingsPayload;

      if (!response.ok) {
        throw new Error(parsePayloadError(payload, "Unable to save workspace API settings."));
      }

      const apiSettings = payload.apiSettings ?? {};
      const nextProvider = String(apiSettings.provider ?? "").trim();
      setProvider(nextProvider.length > 0 ? nextProvider : "OpenAI");
      setModel(String(apiSettings.model ?? ""));
      setDefaultImageSize(String(apiSettings.defaultImageSize ?? "1024x1024"));
      setDefaultParams(toPrettyJson(apiSettings.defaultParams));
      setApiConfigured(Boolean(apiSettings.configured));
      setHasStoredApiKey(Boolean(apiSettings.hasStoredApiKey || apiSettings.configured));
      setApiKey("");
      setWorkspaceMessage("Workspace API settings updated.");
      setWorkspaceMessageTone("success");
    } catch (caught) {
      setWorkspaceMessage(caught instanceof Error ? caught.message : "Unable to save workspace API settings.");
      setWorkspaceMessageTone("error");
    } finally {
      setIsSavingWorkspaceSettings(false);
    }
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
            to="/"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to workspaces
          </Link>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-[var(--accent)] p-2 text-[var(--primary)]">
                  <UserCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-medium text-[var(--foreground)]">Settings</h1>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Manage your account and workspace model API configuration.
                  </p>
                </div>
              </div>
              {canAccessDeveloperDashboard ? (
                <Link
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--accent)]"
                  to="/admin"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Developer Admin Panel
                </Link>
              ) : null}
            </div>

            {profileMessage ? (
              <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${messageToneClass(profileMessageTone)}`}>
                {profileMessage}
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

              <label className="block space-y-1">
                <span className="text-sm text-[var(--foreground)]">Invite Name</span>
                <input
                  className="w-full cursor-not-allowed rounded-lg border border-[var(--border)] bg-[var(--accent)] px-3 py-2 text-sm text-[var(--muted-foreground)]"
                  disabled
                  value={user?.name?.trim() || displayName.trim() || "Member"}
                />
                <p className="text-xs text-[var(--muted-foreground)]">
                  Teammates can use this name or your email when inviting you to a workspace.
                </p>
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

            <div className="my-6 border-t border-[var(--border)]" />

            {passwordMessage ? (
              <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${messageToneClass(passwordMessageTone)}`}>
                {passwordMessage}
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={handlePasswordUpdate}>
              <h2 className="text-base font-medium text-[var(--foreground)]">Change Password</h2>
              <label className="block space-y-1">
                <span className="text-sm text-[var(--foreground)]">New Password</span>
                <input
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none"
                  minLength={8}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  type="password"
                  value={newPassword}
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm text-[var(--foreground)]">Confirm New Password</span>
                <input
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none"
                  minLength={8}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter password"
                  type="password"
                  value={confirmPassword}
                />
              </label>

              <div className="pt-2">
                <button
                  className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                  disabled={isUpdatingPassword}
                  type="submit"
                >
                  {isUpdatingPassword ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>

            <div className="my-6 border-t border-[var(--border)]" />

            <section className="space-y-4" ref={apiSectionRef}>
              <div className="space-y-1">
                <h2 className="text-base font-medium text-[var(--foreground)]">Workspace API Settings</h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Add your model provider API key so your workspace can run prompts and image generation.
                </p>
              </div>

              {onboardingMode && !apiConfigured ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  <p>Workspace API key is required to run prompts. Configure it now or add it later.</p>
                  <button
                    className="rounded-md border border-blue-200 bg-white px-3 py-1.5 text-sm text-blue-700 transition hover:bg-blue-100"
                    onClick={() => {
                      window.localStorage.setItem(
                        API_ONBOARDING_DEFER_KEY,
                        String(Date.now() + API_ONBOARDING_DEFER_MS)
                      );
                      navigate("/", { replace: true });
                    }}
                    type="button"
                  >
                    Add later
                  </button>
                </div>
              ) : null}

              {workspaceMessage ? (
                <div className={`rounded-lg px-3 py-2 text-sm ${messageToneClass(workspaceMessageTone)}`}>
                  {workspaceMessage}
                </div>
              ) : null}

              {isLoadingWorkspaceSettings ? (
                <div className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--muted-foreground)]">
                  Loading workspace settings...
                </div>
              ) : null}

              <form className="space-y-4" onSubmit={handleWorkspaceSettingsSave}>
                <label className="block space-y-1">
                  <span className="text-sm text-[var(--foreground)]">Provider</span>
                  <select
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none"
                    disabled={isLoadingWorkspaceSettings || !hasOrganizationMembership}
                    onChange={(event) => setProvider(event.target.value)}
                    value={provider}
                  >
                    {PROVIDER_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-[var(--foreground)]">Model</span>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none"
                    disabled={isLoadingWorkspaceSettings || !hasOrganizationMembership}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder="e.g. gpt-image-1"
                    value={model}
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-[var(--foreground)]">Default Image Size</span>
                  <select
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none"
                    disabled={isLoadingWorkspaceSettings || !hasOrganizationMembership}
                    onChange={(event) => setDefaultImageSize(event.target.value)}
                    value={defaultImageSize}
                  >
                    {IMAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-[var(--foreground)]">Default Params (JSON)</span>
                  <textarea
                    className="min-h-[120px] w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none"
                    disabled={isLoadingWorkspaceSettings || !hasOrganizationMembership}
                    onChange={(event) => setDefaultParams(event.target.value)}
                    value={defaultParams}
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-sm text-[var(--foreground)]">API Key</span>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none"
                    disabled={isLoadingWorkspaceSettings || !hasOrganizationMembership}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={hasStoredApiKey ? "Leave blank to keep existing key" : "Enter provider API key"}
                    type="password"
                    value={apiKey}
                  />
                </label>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Status: {apiConfigured ? "Configured" : "Not configured"}
                  </p>
                  <button
                    className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                    disabled={isLoadingWorkspaceSettings || isSavingWorkspaceSettings || !hasOrganizationMembership}
                    type="submit"
                  >
                    {isSavingWorkspaceSettings ? "Saving..." : "Save API Settings"}
                  </button>
                </div>
              </form>
            </section>
          </section>
        </div>
      </main>
    </div>
  );
}
