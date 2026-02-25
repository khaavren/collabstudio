import { getAuthenticatedUser } from "./_lib/auth.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "./_lib/http.js";
import { getSupabaseAdminClient } from "./_lib/supabase.js";

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

async function handleGet(req, res) {
  const user = await getAuthenticatedUser(req);
  const adminClient = getSupabaseAdminClient();
  const membership = await loadPrimaryMembership(adminClient, user.id);

  sendJson(res, 200, {
    profile: toProfilePayload(user, membership)
  });
}

async function handlePatch(req, res) {
  const body = (await getJsonBody(req)) ?? {};
  const hasDisplayName = Object.prototype.hasOwnProperty.call(body, "displayName");
  const hasAvatarUrl = Object.prototype.hasOwnProperty.call(body, "avatarUrl");

  if (!hasDisplayName && !hasAvatarUrl) {
    sendJson(res, 400, { error: "Nothing to update." });
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

  if (hasAvatarUrl && avatarUrl === null && body.avatarUrl !== null) {
    sendJson(res, 400, { error: "Avatar URL is invalid." });
    return;
  }

  const user = await getAuthenticatedUser(req);
  const adminClient = getSupabaseAdminClient();

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

  const membership = await loadPrimaryMembership(adminClient, user.id);
  sendJson(res, 200, {
    profile: toProfilePayload(refreshedUserData.user, membership)
  });
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["GET", "PATCH"])) return;

  try {
    if (req.method === "GET") {
      await handleGet(req, res);
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
