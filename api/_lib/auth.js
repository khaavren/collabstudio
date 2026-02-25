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
  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user) {
    throw new HttpError("Invalid auth token.", 401);
  }

  return data.user;
}

export async function getPrimaryMembership(userId) {
  const adminClient = getSupabaseAdminClient();
  const { data, error } = await adminClient
    .from("team_members")
    .select("id, organization_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new HttpError(error.message, 500);
  }

  return data ?? null;
}

async function ensureOrganizationAndMembership(user) {
  const adminClient = getSupabaseAdminClient();

  const { data: firstOrganization, error: orgError } = await adminClient
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (orgError) {
    throw new HttpError(orgError.message, 500);
  }

  let organization = firstOrganization;

  if (!organization) {
    const baseName = "Band Joes Studio";
    const slug = `${slugify(baseName)}-${Date.now().toString(36)}`;

    const { data: createdOrg, error: createError } = await adminClient
      .from("organizations")
      .insert({
        name: baseName,
        slug,
        contact_email: user.email ?? null
      })
      .select("*")
      .single();

    if (createError || !createdOrg) {
      throw new HttpError(createError?.message ?? "Failed to create organization.", 500);
    }

    organization = createdOrg;
  }

  const { error: upsertError } = await adminClient.from("team_members").upsert(
    {
      organization_id: organization.id,
      user_id: user.id,
      role: "admin"
    },
    {
      onConflict: "organization_id,user_id"
    }
  );

  if (upsertError) {
    throw new HttpError(upsertError.message, 500);
  }

  const { data: membership, error: membershipError } = await adminClient
    .from("team_members")
    .select("id, organization_id, role, created_at")
    .eq("organization_id", organization.id)
    .eq("user_id", user.id)
    .single();

  if (membershipError || !membership) {
    throw new HttpError(membershipError?.message ?? "Unable to resolve membership.", 500);
  }

  return {
    organization,
    membership
  };
}

export async function requireAdmin(req) {
  const user = await getAuthenticatedUser(req);

  if (!isAdminEmail(user.email)) {
    throw new HttpError("Not authorized", 403);
  }

  const { organization, membership } = await ensureOrganizationAndMembership(user);

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
