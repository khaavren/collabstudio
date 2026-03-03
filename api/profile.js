import { encryptSecret } from "./_lib/encryption.js";
import { getAuthenticatedUser, requireAdmin } from "./_lib/auth.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "./_lib/http.js";
import { defaultModelForProvider, isSupportedProvider, normalizeProvider } from "./_lib/providers.js";
import { getSupabaseAdminClient, getSupabaseServerAuthClient } from "./_lib/supabase.js";

function parseDisplayName(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 80);
}

function parseAvatarUrl(value) {
  if (value === null) return null;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2048) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

function parseEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function parsePassword(value) {
  if (typeof value !== "string") return null;
  const password = value.trim();
  if (password.length < 8 || password.length > 256) return null;
  return password;
}

function parseBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

function parseRole(value) {
  return value === "admin" || value === "editor" || value === "viewer" ? value : null;
}

function parseImageSize(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{2,5}x\d{2,5}$/.test(trimmed)) return null;
  return trimmed;
}

function parseDefaultParamsInput(value) {
  if (value === undefined) return undefined;

  if (value === null) return {};

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Default params must be a JSON object.");
    }
    return parsed;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  throw new Error("Default params must be a JSON object.");
}

function getRequestOrigin(req) {
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").trim();
  if (!host) return null;

  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").trim().toLowerCase();
  const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : "https";
  return `${protocol}://${host}`;
}

function isMissingDisplayNameColumn(error) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return code === "42703" || (message.includes("display_name") && message.includes("column"));
}

function getMetadataDisplayName(user) {
  const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  return (
    parseDisplayName(metadata.full_name) ??
    parseDisplayName(metadata.name) ??
    parseDisplayName(user.email?.split("@")[0]) ??
    "User"
  );
}

function getMetadataAvatarUrl(user) {
  const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  return parseAvatarUrl(metadata.avatar_url);
}

async function loadPrimaryMembership(adminClient, userId) {
  const { data, error } = await adminClient
    .from("team_members")
    .select("id, organization_id, role, display_name, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingDisplayNameColumn(error)) {
      const fallbackQuery = await adminClient
        .from("team_members")
        .select("id, organization_id, role, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fallbackQuery.error) {
        throw new HttpError(fallbackQuery.error.message, 500);
      }

      return fallbackQuery.data
        ? {
            ...fallbackQuery.data,
            display_name: null
          }
        : null;
    }

    throw new HttpError(error.message, 500);
  }

  return data ?? null;
}

function toProfilePayload(user, membership) {
  const membershipDisplayName = parseDisplayName(membership?.display_name);
  const displayName = membershipDisplayName ?? getMetadataDisplayName(user);

  return {
    id: user.id,
    email: user.email ?? null,
    displayName,
    avatarUrl: getMetadataAvatarUrl(user),
    role: membership?.role ?? null,
    organizationId: membership?.organization_id ?? null,
    membershipId: membership?.id ?? null
  };
}

function toAccessPayload(membership) {
  const role = parseRole(membership?.role);
  return {
    role,
    isAdmin: role === "admin"
  };
}

function toApiSettingsPayload(settings) {
  const provider =
    typeof settings?.provider === "string" && settings.provider.trim().length > 0
      ? settings.provider.trim()
      : "";
  const encryptedApiKey =
    typeof settings?.encrypted_api_key === "string" && settings.encrypted_api_key.trim().length > 0
      ? settings.encrypted_api_key
      : null;

  return {
    provider,
    model: typeof settings?.model === "string" ? settings.model : "",
    defaultImageSize:
      typeof settings?.default_image_size === "string" && settings.default_image_size.trim().length > 0
        ? settings.default_image_size
        : "1024x1024",
    defaultParams:
      settings?.default_params && typeof settings.default_params === "object" && !Array.isArray(settings.default_params)
        ? settings.default_params
        : {},
    configured: Boolean(provider && encryptedApiKey),
    hasStoredApiKey: Boolean(encryptedApiKey),
    updatedAt: typeof settings?.updated_at === "string" ? settings.updated_at : null
  };
}

async function loadApiSettings(adminClient, organizationId) {
  if (!organizationId) {
    return toApiSettingsPayload(null);
  }

  const { data, error } = await adminClient
    .from("api_settings")
    .select("provider, model, default_image_size, default_params, encrypted_api_key, updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(error.message, 500);
  }

  return toApiSettingsPayload(data);
}

async function handleGet(req, res) {
  const user = await getAuthenticatedUser(req);
  const adminClient = getSupabaseAdminClient();
  const membership = await loadPrimaryMembership(adminClient, user.id);
  const apiSettings = await loadApiSettings(adminClient, membership?.organization_id ?? null);

  sendJson(res, 200, {
    profile: toProfilePayload(user, membership),
    access: toAccessPayload(membership),
    apiSettings
  });
}

async function handlePatch(req, res) {
  const body = (await getJsonBody(req)) ?? {};
  const hasDisplayName = Object.prototype.hasOwnProperty.call(body, "displayName");
  const hasAvatarUrl = Object.prototype.hasOwnProperty.call(body, "avatarUrl");
  const hasApiSettings = Object.prototype.hasOwnProperty.call(body, "apiSettings");
  const apiInput = hasApiSettings ? body.apiSettings : null;
  const hasProvider = hasApiSettings && apiInput && Object.prototype.hasOwnProperty.call(apiInput, "provider");
  const hasModel = hasApiSettings && apiInput && Object.prototype.hasOwnProperty.call(apiInput, "model");
  const hasDefaultImageSize =
    hasApiSettings && apiInput && Object.prototype.hasOwnProperty.call(apiInput, "defaultImageSize");
  const hasDefaultParams =
    hasApiSettings && apiInput && Object.prototype.hasOwnProperty.call(apiInput, "defaultParams");
  const hasApiKey = hasApiSettings && apiInput && Object.prototype.hasOwnProperty.call(apiInput, "apiKey");

  if (!hasDisplayName && !hasAvatarUrl && !hasApiSettings) {
    sendJson(res, 400, { error: "Nothing to update." });
    return;
  }

  if (hasApiSettings && (!apiInput || typeof apiInput !== "object" || Array.isArray(apiInput))) {
    sendJson(res, 400, { error: "apiSettings must be an object." });
    return;
  }

  if (hasDisplayName && body.displayName !== null && typeof body.displayName !== "string") {
    sendJson(res, 400, { error: "Display name must be a string." });
    return;
  }

  if (hasAvatarUrl && body.avatarUrl !== null && typeof body.avatarUrl !== "string") {
    sendJson(res, 400, { error: "Avatar URL must be a string." });
    return;
  }

  const displayName = hasDisplayName
    ? body.displayName === null
      ? null
      : parseDisplayName(body.displayName ?? "")
    : undefined;
  const avatarUrl = hasAvatarUrl ? parseAvatarUrl(body.avatarUrl) : undefined;
  const provider = hasProvider ? normalizeProvider(apiInput.provider) : undefined;
  const model = hasModel ? String(apiInput.model ?? "").trim() : undefined;
  const defaultImageSize = hasDefaultImageSize ? parseImageSize(apiInput.defaultImageSize) : undefined;
  const apiKey = hasApiKey ? String(apiInput.apiKey ?? "").trim() : undefined;
  let defaultParams;

  if (hasDefaultParams) {
    try {
      defaultParams = parseDefaultParamsInput(apiInput.defaultParams);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "Default params are invalid." });
      return;
    }
  }

  if (hasAvatarUrl && avatarUrl === null && body.avatarUrl !== null) {
    sendJson(res, 400, { error: "Avatar URL is invalid." });
    return;
  }

  if (provider !== undefined && provider.length > 0 && !isSupportedProvider(provider)) {
    sendJson(res, 400, { error: "Provider is invalid." });
    return;
  }

  if (hasDefaultImageSize && !defaultImageSize) {
    sendJson(res, 400, { error: "Default image size must use WIDTHxHEIGHT format." });
    return;
  }

  if (hasApiKey && apiKey === undefined) {
    sendJson(res, 400, { error: "API key is invalid." });
    return;
  }

  const user = await getAuthenticatedUser(req);
  const adminClient = getSupabaseAdminClient();
  let refreshedUser = user;
  let membership = await loadPrimaryMembership(adminClient, user.id);

  if (hasDisplayName || hasAvatarUrl) {
    const metadata =
      user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};

    const nextDisplayName =
      displayName === undefined
        ? parseDisplayName(metadata.full_name) ?? parseDisplayName(metadata.name) ?? null
        : displayName;
    const nextAvatarUrl = avatarUrl === undefined ? parseAvatarUrl(metadata.avatar_url) : avatarUrl;

    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...metadata,
        full_name: nextDisplayName,
        name: nextDisplayName,
        avatar_url: nextAvatarUrl
      }
    });

    if (authUpdateError) {
      throw new HttpError(authUpdateError.message, 500);
    }

    if (displayName !== undefined) {
      const { error: membershipError } = await adminClient
        .from("team_members")
        .update({ display_name: displayName })
        .eq("user_id", user.id);

      if (membershipError && !isMissingDisplayNameColumn(membershipError)) {
        throw new HttpError(membershipError.message, 500);
      }
    }

    const { data: refreshedUserData, error: refreshedUserError } = await adminClient.auth.admin.getUserById(
      user.id
    );

    if (refreshedUserError || !refreshedUserData?.user) {
      throw new HttpError(refreshedUserError?.message ?? "Unable to load updated user.", 500);
    }

    refreshedUser = refreshedUserData.user;
    membership = await loadPrimaryMembership(adminClient, user.id);
  }

  if (hasApiSettings) {
    if (!membership?.organization_id) {
      sendJson(res, 403, { error: "No organization is linked to your account yet." });
      return;
    }

    const { data: existingSettings, error: lookupError } = await adminClient
      .from("api_settings")
      .select("provider, model, default_image_size, default_params, encrypted_api_key")
      .eq("organization_id", membership.organization_id)
      .maybeSingle();

    if (lookupError) {
      throw new HttpError(lookupError.message, 500);
    }

    const persistedProvider = provider !== undefined ? provider : existingSettings?.provider ?? "";
    const encryptedApiKey =
      apiKey !== undefined
        ? apiKey.length > 0
          ? encryptSecret(apiKey)
          : existingSettings?.encrypted_api_key ?? null
        : existingSettings?.encrypted_api_key ?? null;
    const persistedModel =
      model !== undefined
        ? model || defaultModelForProvider(persistedProvider)
        : existingSettings?.model || defaultModelForProvider(persistedProvider);
    const persistedDefaultImageSize =
      defaultImageSize !== undefined
        ? defaultImageSize
        : existingSettings?.default_image_size || "1024x1024";
    const persistedDefaultParams =
      defaultParams !== undefined ? defaultParams : existingSettings?.default_params ?? {};

    const { error: upsertError } = await adminClient.from("api_settings").upsert(
      {
        organization_id: membership.organization_id,
        provider: persistedProvider || null,
        model: persistedModel || null,
        default_image_size: persistedDefaultImageSize,
        default_params: persistedDefaultParams,
        encrypted_api_key: encryptedApiKey,
        updated_by: user.id
      },
      {
        onConflict: "organization_id"
      }
    );

    if (upsertError) {
      throw new HttpError(upsertError.message, 500);
    }
  }

  const apiSettings = await loadApiSettings(adminClient, membership?.organization_id ?? null);
  sendJson(res, 200, {
    profile: toProfilePayload(refreshedUser, membership),
    access: toAccessPayload(membership),
    apiSettings
  });
}

async function handlePost(req, res) {
  const body = (await getJsonBody(req)) ?? {};
  const action = String(body.action ?? "").trim();
  if (
    action !== "request-password-reset" &&
    action !== "admin-set-password" &&
    action !== "admin-suspend-user" &&
    action !== "admin-delete-user"
  ) {
    sendJson(res, 400, { error: "Invalid action." });
    return;
  }

  if (action === "admin-set-password" || action === "admin-suspend-user" || action === "admin-delete-user") {
    const { user: actingUser } = await requireAdmin(req);
    const adminClient = getSupabaseAdminClient();
    const userId = String(body.userId ?? "").trim();

    if (!userId) {
      sendJson(res, 400, { error: "User ID is required." });
      return;
    }

    if (userId === actingUser.id) {
      sendJson(res, 400, { error: "You cannot apply this action to your own account." });
      return;
    }

    if (action === "admin-set-password") {
      const newPassword = parsePassword(body.newPassword);
      if (!newPassword) {
        sendJson(res, 400, { error: "Password must be 8-256 characters." });
        return;
      }

      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        password: newPassword
      });

      if (error) {
        throw new HttpError("Unable to update user password.", 500);
      }

      sendJson(res, 200, { ok: true, message: "Password updated." });
      return;
    }

    if (action === "admin-suspend-user") {
      const suspended = parseBoolean(body.suspended);
      if (suspended === null) {
        sendJson(res, 400, { error: "Suspended flag must be true or false." });
        return;
      }

      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: suspended ? "876000h" : "none"
      });

      if (error) {
        throw new HttpError("Unable to update user suspension.", 500);
      }

      sendJson(res, 200, {
        ok: true,
        message: suspended ? "User suspended." : "User unsuspended."
      });
      return;
    }

    // admin-delete-user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId, true);
    if (deleteError && Number(deleteError.status ?? 0) !== 404) {
      throw new HttpError("Unable to delete user.", 500);
    }

    const { error: membershipCleanupError } = await adminClient
      .from("team_members")
      .delete()
      .eq("user_id", userId);

    if (membershipCleanupError) {
      throw new HttpError("User deleted, but team membership cleanup failed.", 500);
    }

    const { error: collaboratorCleanupError } = await adminClient
      .from("workspace_collaborators")
      .update({ user_id: null })
      .eq("user_id", userId);

    if (collaboratorCleanupError) {
      throw new HttpError("User deleted, but collaborator cleanup failed.", 500);
    }

    sendJson(res, 200, {
      ok: true,
      message: "User deleted."
    });
    return;
  }

  const email = parseEmail(body.email);
  if (!email) {
    sendJson(res, 400, { error: "Valid email is required." });
    return;
  }

  const origin = getRequestOrigin(req);
  if (!origin) {
    throw new HttpError("Unable to resolve request origin.", 500);
  }

  const authClient = getSupabaseServerAuthClient();
  const { error } = await authClient.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`
  });

  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    const code = String(error.code ?? "");
    const status = Number(error.status ?? 0);
    const isRateLimited =
      status === 429 || code === "over_email_send_rate_limit" || message.includes("rate limit");

    if (isRateLimited) {
      throw new HttpError("Too many reset attempts. Please wait 60 minutes and try once.", 429);
    }

    throw new HttpError("Unable to send reset email at the moment.", 500);
  }

  sendJson(res, 200, { ok: true });
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["GET", "PATCH", "POST"])) return;

  try {
    if (req.method === "GET") {
      await handleGet(req, res);
      return;
    }

    if (req.method === "POST") {
      await handlePost(req, res);
      return;
    }

    await handlePatch(req, res);
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    sendJson(res, 500, { error: "Unexpected server error." });
  }
}
