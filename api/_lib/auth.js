import { HttpError } from "./http.js";
import { getSupabaseAdminClient, getSupabaseServerAuthClient } from "./supabase.js";

function getBearerToken(req) {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function parseAdminEmails() {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function getUserMetadata(user) {
  return user?.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function membershipRoleRank(role) {
  if (role === "admin") return 0;
  if (role === "editor") return 1;
  if (role === "viewer") return 2;
  return 3;
}

function choosePreferredMembership(memberships) {
  if (!Array.isArray(memberships) || memberships.length === 0) return null;

  const ranked = [...memberships].sort((left, right) => {
    const roleDiff = membershipRoleRank(left.role) - membershipRoleRank(right.role);
    if (roleDiff !== 0) return roleDiff;

    const leftCreated = String(left.created_at ?? "");
    const rightCreated = String(right.created_at ?? "");
    return leftCreated.localeCompare(rightCreated);
  });

  return ranked[0] ?? null;
}

function getStudioDefaultsForUser(user) {
  const metadata = getUserMetadata(user);
  const emailHandle =
    typeof user.email === "string" && user.email.includes("@")
      ? user.email.split("@")[0]
      : `user-${String(user.id ?? "").slice(0, 8)}`;

  const identity = firstNonEmptyString(
    metadata.full_name,
    metadata.name,
    metadata.display_name,
    metadata.preferred_username,
    emailHandle
  );

  const baseIdentity = identity ?? `user-${String(user.id ?? "").slice(0, 8)}`;
  const baseName = `${baseIdentity} Studio`;
  const baseSlug = slugify(baseIdentity) || `studio-${String(user.id ?? "").slice(0, 8)}`;

  return {
    name: baseName,
    slug: baseSlug
  };
}

async function loadMembershipsForUser(userId) {
  const adminClient = getSupabaseAdminClient();
  const { data, error } = await adminClient
    .from("team_members")
    .select("id, organization_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new HttpError(error.message, 500);
  }

  return Array.isArray(data) ? data : [];
}

async function hasAnyTeamMembers() {
  const adminClient = getSupabaseAdminClient();
  const { count, error } = await adminClient.from("team_members").select("id", { count: "exact", head: true });

  if (error) {
    throw new HttpError(error.message, 500);
  }

  return (count ?? 0) > 0;
}

async function loadOrganizationById(organizationId) {
  const adminClient = getSupabaseAdminClient();
  const { data, error } = await adminClient
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    throw new HttpError(error.message, 500);
  }

  return data ?? null;
}

async function createOrganizationForUser(user) {
  const adminClient = getSupabaseAdminClient();
  const defaults = getStudioDefaultsForUser(user);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const slug = attempt === 0 ? defaults.slug : `${defaults.slug}-${attempt + 1}`;
    const payload = {
      name: defaults.name,
      slug,
      contact_email: user.email ?? null
    };

    const { data, error } = await adminClient.from("organizations").insert(payload).select("*").single();

    if (!error && data) {
      return data;
    }

    if (error?.code === "23505") {
      continue;
    }

    throw new HttpError(error?.message ?? "Failed to create organization.", 500);
  }

  throw new HttpError("Failed to create a unique organization slug.", 500);
}

export function isAdminEmail(email) {
  if (!email) return false;
  const admins = parseAdminEmails();
  if (admins.length === 0) return false;
  return admins.includes(String(email).toLowerCase());
}

export async function getAuthenticatedUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    throw new HttpError("Missing bearer token.", 401);
  }

  const authClient = getSupabaseServerAuthClient();
  const primaryResult = await authClient.auth.getUser(token);
  if (!primaryResult.error && primaryResult.data.user) {
    return primaryResult.data.user;
  }

  // Fallback for deployments where anon-key env wiring is stale but service-role is valid.
  const adminClient = getSupabaseAdminClient();
  const fallbackResult = await adminClient.auth.getUser(token);
  if (!fallbackResult.error && fallbackResult.data.user) {
    return fallbackResult.data.user;
  }

  throw new HttpError("Invalid auth token.", 401);
}

export async function getPrimaryMembership(userId) {
  const memberships = await loadMembershipsForUser(userId);
  return choosePreferredMembership(memberships);
}

async function resolveOrganizationMembership(user) {
  const adminClient = getSupabaseAdminClient();
  const memberships = await loadMembershipsForUser(user.id);

  const preferredMembership = choosePreferredMembership(memberships);
  if (preferredMembership) {
    const organization = await loadOrganizationById(preferredMembership.organization_id);
    if (!organization) {
      throw new HttpError("Organization not found for membership.", 500);
    }

    return {
      organization,
      membership: preferredMembership
    };
  }

  const hasConfiguredAdminEmails = parseAdminEmails().length > 0;
  if (!isAdminEmail(user.email ?? null)) {
    if (hasConfiguredAdminEmails || (await hasAnyTeamMembers())) {
      throw new HttpError("Not authorized for admin access.", 403);
    }
  }

  const organization = await createOrganizationForUser(user);

  const { error: insertError } = await adminClient.from("team_members").insert({
    organization_id: organization.id,
    user_id: user.id,
    role: "admin"
  });

  if (insertError) {
    throw new HttpError(insertError.message, 500);
  }

  const membership = await getPrimaryMembership(user.id);
  if (!membership || membership.organization_id !== organization.id) {
    throw new HttpError("Unable to resolve organization membership.", 500);
  }

  return {
    organization,
    membership
  };
}

export async function requireOrganizationMember(req) {
  const user = await getAuthenticatedUser(req);
  const { organization, membership } = await resolveOrganizationMembership(user);

  return {
    user,
    organization,
    membership
  };
}

export async function requireAdmin(req) {
  const { user, organization, membership } = await requireOrganizationMember(req);

  if (membership.role !== "admin") {
    throw new HttpError("Admin role is required.", 403);
  }

  return {
    user,
    organization,
    membership
  };
}

export async function resolveMembership(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  try {
    const user = await getAuthenticatedUser(req);
    const membership = await getPrimaryMembership(user.id);
    return membership;
  } catch {
    return null;
  }
}
