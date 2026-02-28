import { readFile } from "node:fs/promises";
import path from "node:path";
import { encryptSecret } from "../_lib/encryption.js";
import { requireAdmin, requireOrganizationMember } from "../_lib/auth.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "../_lib/http.js";
import {
  defaultModelForProvider,
  isSupportedProvider,
  normalizeProvider
} from "../_lib/providers.js";
import { getSupabaseAdminClient } from "../_lib/supabase.js";

const AUTH_PAGE_SIZE = 1000;
const ACTIVE_USER_WINDOW_DAYS = 30;

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function nullable(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function parseRole(value) {
  return value === "admin" || value === "editor" || value === "viewer" ? value : "viewer";
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function toNonEmptyStringOrNull(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseDateToEpoch(value) {
  const dateValue = toNonEmptyStringOrNull(value);
  if (!dateValue) return null;
  const parsed = Date.parse(dateValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function isWithinDays(value, days) {
  const timestamp = parseDateToEpoch(value);
  if (timestamp === null) return false;
  const windowMs = days * 24 * 60 * 60 * 1000;
  return Date.now() - timestamp <= windowMs;
}

function compareDateDescending(left, right) {
  const leftEpoch = parseDateToEpoch(left);
  const rightEpoch = parseDateToEpoch(right);

  if (leftEpoch !== null && rightEpoch !== null) return rightEpoch - leftEpoch;
  if (leftEpoch !== null) return -1;
  if (rightEpoch !== null) return 1;
  return 0;
}

function maxIsoDate(left, right) {
  if (!left) return right ?? null;
  if (!right) return left;
  return compareDateDescending(left, right) <= 0 ? left : right;
}

async function listAllAuthUsers(adminClient) {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE
    });

    if (error) {
      throw new HttpError(error.message, 500);
    }

    const batch = Array.isArray(data?.users) ? data.users : [];
    users.push(...batch);

    if (batch.length < AUTH_PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return users;
}

function buildAuthUserMap(users) {
  return new Map(users.map((entry) => [entry.id, entry]));
}

async function countTableRows(adminClient, tableName) {
  const { count, error } = await adminClient.from(tableName).select("id", { count: "exact", head: true });
  if (error) {
    throw new HttpError(error.message, 500);
  }

  return typeof count === "number" ? count : 0;
}

function getUserDisplayName(user, teamDisplayName) {
  const metadata = user?.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const emailHandle =
    typeof user?.email === "string" && user.email.includes("@") ? user.email.split("@")[0] : null;

  return firstNonEmptyString(
    teamDisplayName,
    metadata.full_name,
    metadata.name,
    metadata.display_name,
    metadata.preferred_username,
    emailHandle
  );
}

function validateOrg(payload) {
  const errors = [];

  if (!payload.name) {
    errors.push("Organization name is required.");
  }

  if (!payload.slug) {
    errors.push("Slug is required.");
  }

  if (!/^[a-z0-9-]+$/.test(payload.slug)) {
    errors.push("Slug must contain lowercase letters, numbers, and hyphens.");
  }

  if (payload.website) {
    try {
      // eslint-disable-next-line no-new
      new URL(payload.website);
    } catch {
      errors.push("Website must be a valid URL.");
    }
  }

  if (payload.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contactEmail)) {
    errors.push("Contact email is invalid.");
  }

  return errors;
}

function parseDefaultParams(raw) {
  if (!raw || !String(raw).trim()) return {};

  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Default params must be a JSON object.");
  }

  return parsed;
}

async function readAppVersion() {
  const packagePath = path.join(process.cwd(), "package.json");
  const content = await readFile(packagePath, "utf8");
  const parsed = JSON.parse(content);
  return parsed.version ?? "unknown";
}

async function loadTeamMembersWithEmails(organizationId, userMapInput) {
  const adminClient = getSupabaseAdminClient();

  const { data: members, error: membersError } = await adminClient
    .from("team_members")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (membersError) {
    throw new HttpError(membersError.message, 500);
  }

  const userMap = userMapInput ?? buildAuthUserMap(await listAllAuthUsers(adminClient));

  return (members ?? []).map((member) => {
    const tableDisplayName =
      typeof member.display_name === "string" && member.display_name.trim().length > 0
        ? member.display_name.trim()
        : null;
    const metadataDisplayName =
      userMap.get(member.user_id)?.user_metadata?.full_name ??
      userMap.get(member.user_id)?.user_metadata?.name ??
      null;

    return {
      ...member,
      role: parseRole(member.role),
      email: userMap.get(member.user_id)?.email ?? null,
      displayName: tableDisplayName ?? metadataDisplayName
    };
  });
}

function buildDeveloperUsers(authUsers, teamMembers, workspaces, collaborators) {
  const teamMembersByUserId = new Map(teamMembers.map((member) => [member.user_id, member]));
  const ownedWorkspaceCounts = new Map();
  const lastOwnedWorkspaceActivity = new Map();
  const collaboratorWorkspaceSets = new Map();

  for (const workspace of workspaces) {
    if (typeof workspace.owner_id !== "string" || workspace.owner_id.length === 0) continue;

    ownedWorkspaceCounts.set(
      workspace.owner_id,
      (ownedWorkspaceCounts.get(workspace.owner_id) ?? 0) + 1
    );

    const activityAt =
      toNonEmptyStringOrNull(workspace.updated_at) ?? toNonEmptyStringOrNull(workspace.created_at);
    if (activityAt) {
      const previous = lastOwnedWorkspaceActivity.get(workspace.owner_id) ?? null;
      lastOwnedWorkspaceActivity.set(workspace.owner_id, maxIsoDate(previous, activityAt));
    }
  }

  for (const collaborator of collaborators) {
    if (typeof collaborator.user_id !== "string" || collaborator.user_id.length === 0) continue;
    if (typeof collaborator.workspace_id !== "string" || collaborator.workspace_id.length === 0) continue;

    const set = collaboratorWorkspaceSets.get(collaborator.user_id) ?? new Set();
    set.add(collaborator.workspace_id);
    collaboratorWorkspaceSets.set(collaborator.user_id, set);
  }

  const users = authUsers.map((user) => {
    const teamMember = teamMembersByUserId.get(user.id) ?? null;
    const ownedWorkspaceCount = ownedWorkspaceCounts.get(user.id) ?? 0;
    const collaboratorWorkspaceCount = (collaboratorWorkspaceSets.get(user.id) ?? new Set()).size;
    const lastSignInAt = toNonEmptyStringOrNull(user.last_sign_in_at);
    const createdAt = toNonEmptyStringOrNull(user.created_at);
    const lastWorkspaceActivityAt = lastOwnedWorkspaceActivity.get(user.id) ?? null;
    const accountStatus = lastSignInAt
      ? isWithinDays(lastSignInAt, ACTIVE_USER_WINDOW_DAYS)
        ? "active"
        : "idle"
      : "never";

    return {
      userId: user.id,
      email: toNonEmptyStringOrNull(user.email),
      displayName: getUserDisplayName(user, teamMember?.displayName ?? null),
      createdAt,
      lastSignInAt,
      accountStatus,
      ownedWorkspaceCount,
      collaboratorWorkspaceCount,
      totalWorkspaceCount: ownedWorkspaceCount + collaboratorWorkspaceCount,
      lastWorkspaceActivityAt,
      isEmployee: Boolean(teamMember),
      employeeRole: teamMember ? parseRole(teamMember.role) : null,
      teamMemberId: teamMember?.id ?? null
    };
  });

  return users.sort((left, right) => {
    const bySignIn = compareDateDescending(left.lastSignInAt, right.lastSignInAt);
    if (bySignIn !== 0) return bySignIn;

    const byCreatedAt = compareDateDescending(left.createdAt, right.createdAt);
    if (byCreatedAt !== 0) return byCreatedAt;

    return String(left.email ?? "").localeCompare(String(right.email ?? ""));
  });
}

async function buildDeveloperDashboardPayload(organizationId, teamMembers, authUsers) {
  const adminClient = getSupabaseAdminClient();
  const [workspacesQuery, collaboratorsQuery, roomsCount, assetsCount, assetVersionsCount, commentsCount] =
    await Promise.all([
      adminClient.from("workspaces").select("owner_id, created_at, updated_at"),
      adminClient.from("workspace_collaborators").select("workspace_id, user_id"),
      countTableRows(adminClient, "rooms"),
      countTableRows(adminClient, "assets"),
      countTableRows(adminClient, "asset_versions"),
      countTableRows(adminClient, "comments")
    ]);

  if (workspacesQuery.error) {
    throw new HttpError(workspacesQuery.error.message, 500);
  }

  if (collaboratorsQuery.error) {
    throw new HttpError(collaboratorsQuery.error.message, 500);
  }

  const workspaces = workspacesQuery.data ?? [];
  const collaborators = collaboratorsQuery.data ?? [];
  const users = buildDeveloperUsers(authUsers, teamMembers, workspaces, collaborators);

  return {
    organizationId,
    summary: {
      totalUsers: users.length,
      activeUsers30d: users.filter((entry) => entry.accountStatus === "active").length,
      employeeUsers: users.filter((entry) => entry.isEmployee).length,
      inactiveUsers: users.filter((entry) => entry.accountStatus !== "active").length
    },
    totals: {
      workspaces: workspaces.length,
      workspaceCollaborators: collaborators.length,
      rooms: roomsCount,
      assets: assetsCount,
      assetVersions: assetVersionsCount,
      comments: commentsCount
    },
    users
  };
}

async function getSettingsPayload(organizationId, accessRole = "admin") {
  const adminClient = getSupabaseAdminClient();
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [organizationQuery, apiSettingsQuery, usageQuery, bucketQuery, appVersion, authUsers] =
    await Promise.all([
      adminClient.from("organizations").select("*").eq("id", organizationId).single(),
      adminClient.from("api_settings").select("*").eq("organization_id", organizationId).maybeSingle(),
      adminClient
        .from("usage_metrics")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("month", currentMonth)
        .maybeSingle(),
      adminClient.storage.getBucket("bandjoes-assets"),
      readAppVersion(),
      listAllAuthUsers(adminClient)
    ]);

  if (organizationQuery.error || !organizationQuery.data) {
    throw new HttpError(organizationQuery.error?.message ?? "Organization not found.", 500);
  }

  if (apiSettingsQuery.error) {
    throw new HttpError(apiSettingsQuery.error.message, 500);
  }

  if (usageQuery.error) {
    throw new HttpError(usageQuery.error.message, 500);
  }

  const authUserMap = buildAuthUserMap(authUsers);
  const teamMembers = await loadTeamMembersWithEmails(organizationId, authUserMap);
  const developerDashboard = await buildDeveloperDashboardPayload(organizationId, teamMembers, authUsers);
  const apiSettings = apiSettingsQuery.data;
  const configured = Boolean(apiSettings?.provider && apiSettings?.encrypted_api_key);

  return {
    organization: organizationQuery.data,
    teamMembers,
    apiSettings: {
      provider: apiSettings?.provider ?? "",
      model: apiSettings?.model ?? "",
      defaultImageSize: apiSettings?.default_image_size ?? "1024x1024",
      defaultParams: apiSettings?.default_params ?? {},
      configured,
      updatedAt: apiSettings?.updated_at ?? null
    },
    usage: usageQuery.data ?? {
      month: currentMonth,
      images_generated: 0,
      storage_used_mb: 0,
      api_calls: 0
    },
    security: {
      supabaseConnected: true,
      storageBucketConnected: !bucketQuery.error,
      modelApiConfigured: configured,
      lastSettingsUpdate: apiSettings?.updated_at ?? organizationQuery.data.updated_at,
      appVersion
    },
    access: {
      role: parseRole(accessRole),
      isAdmin: parseRole(accessRole) === "admin"
    },
    developerDashboard
  };
}

async function handleGet(req, res) {
  const { organization, membership } = await requireOrganizationMember(req);
  const payload = await getSettingsPayload(organization.id, membership.role);
  sendJson(res, 200, payload);
}

async function handlePost(req, res) {
  const { organization, user, membership } = await requireAdmin(req);
  const adminClient = getSupabaseAdminClient();
  const body = (await getJsonBody(req)) ?? {};

  const organizationInput = body.organization ?? {};
  const apiInput = body.api ?? {};

  const orgPayload = {
    name: String(organizationInput.name ?? "").trim(),
    slug: slugify(organizationInput.slug ?? ""),
    website: String(organizationInput.website ?? "").trim(),
    contactEmail: String(organizationInput.contactEmail ?? "").trim(),
    phone: String(organizationInput.phone ?? "").trim(),
    addressLine1: String(organizationInput.addressLine1 ?? "").trim(),
    addressLine2: String(organizationInput.addressLine2 ?? "").trim(),
    city: String(organizationInput.city ?? "").trim(),
    state: String(organizationInput.state ?? "").trim(),
    postalCode: String(organizationInput.postalCode ?? "").trim(),
    country: String(organizationInput.country ?? "").trim(),
    logoStoragePath: String(organizationInput.logoStoragePath ?? "").trim()
  };

  const apiPayload = {
    provider: normalizeProvider(apiInput.provider),
    model: String(apiInput.model ?? "").trim(),
    defaultImageSize: String(apiInput.defaultImageSize ?? "1024x1024").trim() || "1024x1024",
    defaultParams: String(apiInput.defaultParams ?? "{}"),
    apiKey: String(apiInput.apiKey ?? "").trim()
  };

  const errors = validateOrg(orgPayload);

  if (apiPayload.provider && !isSupportedProvider(apiPayload.provider)) {
    errors.push("Provider is invalid.");
  }

  if (errors.length > 0) {
    sendJson(res, 400, { error: errors.join(" ") });
    return;
  }

  const defaultParams = parseDefaultParams(apiPayload.defaultParams);

  const { error: orgError } = await adminClient
    .from("organizations")
    .update({
      name: orgPayload.name,
      slug: orgPayload.slug,
      website: nullable(orgPayload.website),
      contact_email: nullable(orgPayload.contactEmail),
      phone: nullable(orgPayload.phone),
      address_line1: nullable(orgPayload.addressLine1),
      address_line2: nullable(orgPayload.addressLine2),
      city: nullable(orgPayload.city),
      state: nullable(orgPayload.state),
      postal_code: nullable(orgPayload.postalCode),
      country: nullable(orgPayload.country),
      ...(orgPayload.logoStoragePath ? { logo_storage_path: orgPayload.logoStoragePath } : {})
    })
    .eq("id", organization.id);

  if (orgError) {
    throw new HttpError(orgError.message, 500);
  }

  const { data: existingSettings, error: settingsLookupError } = await adminClient
    .from("api_settings")
    .select("encrypted_api_key, model")
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (settingsLookupError) {
    throw new HttpError(settingsLookupError.message, 500);
  }

  const encryptedApiKey =
    apiPayload.apiKey.length > 0
      ? encryptSecret(apiPayload.apiKey)
      : existingSettings?.encrypted_api_key ?? null;
  const persistedModel =
    apiPayload.model || existingSettings?.model || defaultModelForProvider(apiPayload.provider);

  const { error: upsertError } = await adminClient.from("api_settings").upsert(
    {
      organization_id: organization.id,
      provider: nullable(apiPayload.provider),
      model: nullable(persistedModel),
      default_image_size: nullable(apiPayload.defaultImageSize),
      default_params: defaultParams,
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

  const payload = await getSettingsPayload(organization.id, membership.role);
  sendJson(res, 200, payload);
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["GET", "POST"])) return;

  try {
    if (req.method === "GET") {
      await handleGet(req, res);
      return;
    }

    await handlePost(req, res);
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    if (error instanceof Error && error.message.includes("JSON")) {
      sendJson(res, 400, { error: error.message });
      return;
    }

    sendJson(res, 500, { error: "Unexpected server error." });
  }
}
