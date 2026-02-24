import type { User } from "@supabase/supabase-js";
import type { TeamRole } from "@/lib/types";
import { getSupabaseAdminClient, getSupabaseServerAuthClient } from "@/lib/server/supabase-admin";

export class RequestAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function parseAdminEmails() {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  const emails = parseAdminEmails();
  if (emails.length === 0) return false;
  return emails.includes(email.toLowerCase());
}

export async function getAuthenticatedUser(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    throw new RequestAuthError("Missing bearer token.", 401);
  }

  const authClient = getSupabaseServerAuthClient();
  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user) {
    throw new RequestAuthError("Invalid auth token.", 401);
  }

  return data.user;
}

export async function getPrimaryMembership(userId: string) {
  const adminClient = getSupabaseAdminClient();
  const { data, error } = await adminClient
    .from("team_members")
    .select("id, organization_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new RequestAuthError(error.message, 500);
  }

  return data;
}

async function ensureOrganizationAndMembership(user: User) {
  const adminClient = getSupabaseAdminClient();

  const { data: firstOrganization, error: orgError } = await adminClient
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let organization = firstOrganization;

  if (orgError) {
    throw new RequestAuthError(orgError.message, 500);
  }

  if (!organization) {
    const baseName = "Band Joes Studio";
    const baseSlug = slugify(baseName);
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    const { data: createdOrg, error: createOrgError } = await adminClient
      .from("organizations")
      .insert({
        name: baseName,
        slug,
        contact_email: user.email ?? null
      })
      .select("*")
      .single();

    if (createOrgError || !createdOrg) {
      throw new RequestAuthError(createOrgError?.message ?? "Failed to create organization.", 500);
    }

    organization = createdOrg;
  }

  const { error: upsertMemberError } = await adminClient.from("team_members").upsert(
    {
      organization_id: organization.id,
      user_id: user.id,
      role: "admin"
    },
    {
      onConflict: "organization_id,user_id"
    }
  );

  if (upsertMemberError) {
    throw new RequestAuthError(upsertMemberError.message, 500);
  }

  const { data: membership, error: membershipError } = await adminClient
    .from("team_members")
    .select("id, organization_id, role, created_at")
    .eq("organization_id", organization.id)
    .eq("user_id", user.id)
    .single();

  if (membershipError) {
    throw new RequestAuthError(membershipError.message, 500);
  }

  if (!membership) {
    throw new RequestAuthError("Unable to resolve membership.", 500);
  }

  return {
    organization,
    membership
  };
}

export async function requireAdminRequest(request: Request) {
  const user = await getAuthenticatedUser(request);

  if (!isAdminEmail(user.email)) {
    throw new RequestAuthError("Not authorized", 403);
  }

  const { organization, membership } = await ensureOrganizationAndMembership(user);

  if (membership.role !== "admin") {
    throw new RequestAuthError("Admin role is required.", 403);
  }

  return {
    user,
    organization,
    membership
  };
}

export async function requireMemberRequest(request: Request, allowedRoles: TeamRole[]) {
  const user = await getAuthenticatedUser(request);
  const membership = await getPrimaryMembership(user.id);

  if (!membership) {
    throw new RequestAuthError("Team membership not found.", 403);
  }

  if (!allowedRoles.includes(membership.role)) {
    throw new RequestAuthError("Insufficient role permissions.", 403);
  }

  return {
    user,
    membership
  };
}
