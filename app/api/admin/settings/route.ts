import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { BANDJOES_BUCKET } from "@/lib/storage";
import { RequestAuthError, requireAdminRequest } from "@/lib/server/auth";
import { encryptSecret } from "@/lib/server/encryption";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import type { Json, TeamMemberWithUser, TeamRole } from "@/lib/types";

export const runtime = "nodejs";

const PROVIDERS = ["OpenAI", "Replicate", "Stability", "Custom HTTP"] as const;

type OrganizationPayload = {
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

type ApiPayload = {
  provider: string;
  model: string;
  defaultImageSize: string;
  defaultParams: string;
  apiKey: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function safeString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function nullable(value: string) {
  return value.length > 0 ? value : null;
}

function parseRole(value: unknown): TeamRole {
  if (value === "admin" || value === "editor" || value === "viewer") return value;
  return "viewer";
}

function validateOrgPayload(payload: OrganizationPayload) {
  const errors: string[] = [];

  if (!payload.name) errors.push("Organization name is required.");
  if (!payload.slug) errors.push("Slug is required.");
  if (!/^[a-z0-9-]+$/.test(payload.slug)) {
    errors.push("Slug must contain only lowercase letters, numbers, and hyphens.");
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

function parseDefaultParams(raw: string) {
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Default params must be a JSON object.");
  }
  return parsed as Json;
}

async function readAppVersion() {
  const packagePath = path.join(process.cwd(), "package.json");
  const content = await readFile(packagePath, "utf8");
  const parsed = JSON.parse(content) as { version?: string };
  return parsed.version ?? "unknown";
}

async function loadTeamMembersWithEmails(organizationId: string): Promise<TeamMemberWithUser[]> {
  const adminClient = getSupabaseAdminClient();

  const { data: members, error: membersError } = await adminClient
    .from("team_members")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (membersError) {
    throw new RequestAuthError(membersError.message, 500);
  }

  const { data: usersPage, error: usersError } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (usersError) {
    throw new RequestAuthError(usersError.message, 500);
  }

  const emailMap = new Map(usersPage.users.map((entry) => [entry.id, entry.email ?? null]));

  return (members ?? []).map((member) => ({
    ...member,
    role: parseRole(member.role),
    email: emailMap.get(member.user_id) ?? null
  }));
}

async function uploadOrganizationLogo(organizationId: string, file: File) {
  const adminClient = getSupabaseAdminClient();
  const extension = file.type.includes("png") ? "png" : file.type.includes("svg") ? "svg" : "jpg";
  const storagePath = `orgs/${organizationId}/branding/logo-${Date.now()}.${extension}`;

  const { error } = await adminClient.storage.from(BANDJOES_BUCKET).upload(storagePath, file, {
    contentType: file.type || "image/jpeg",
    upsert: true
  });

  if (error) {
    throw new RequestAuthError(error.message, 500);
  }

  return storagePath;
}

async function getSettingsPayload(organizationId: string) {
  const adminClient = getSupabaseAdminClient();

  const [organizationQuery, apiSettingsQuery, usageQuery, bucketQuery, appVersion, teamMembers] =
    await Promise.all([
      adminClient.from("organizations").select("*").eq("id", organizationId).single(),
      adminClient.from("api_settings").select("*").eq("organization_id", organizationId).maybeSingle(),
      adminClient
        .from("usage_metrics")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("month", new Date().toISOString().slice(0, 7))
        .maybeSingle(),
      adminClient.storage.getBucket(BANDJOES_BUCKET),
      readAppVersion(),
      loadTeamMembersWithEmails(organizationId)
    ]);

  if (organizationQuery.error || !organizationQuery.data) {
    throw new RequestAuthError(organizationQuery.error?.message ?? "Organization not found.", 500);
  }

  if (apiSettingsQuery.error) {
    throw new RequestAuthError(apiSettingsQuery.error.message, 500);
  }

  if (usageQuery.error) {
    throw new RequestAuthError(usageQuery.error.message, 500);
  }

  const apiSettings = apiSettingsQuery.data;
  const configured = Boolean(
    apiSettings?.provider && apiSettings?.model && apiSettings?.encrypted_api_key
  );

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
      month: new Date().toISOString().slice(0, 7),
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
    }
  };
}

export async function GET(request: Request) {
  try {
    const { organization } = await requireAdminRequest(request);
    const payload = await getSettingsPayload(organization.id);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { organization, user } = await requireAdminRequest(request);
    const adminClient = getSupabaseAdminClient();

    const form = await request.formData();

    const orgPayload: OrganizationPayload = {
      name: safeString(form.get("name")),
      slug: slugify(safeString(form.get("slug"))),
      website: safeString(form.get("website")),
      contactEmail: safeString(form.get("contactEmail")),
      phone: safeString(form.get("phone")),
      addressLine1: safeString(form.get("addressLine1")),
      addressLine2: safeString(form.get("addressLine2")),
      city: safeString(form.get("city")),
      state: safeString(form.get("state")),
      postalCode: safeString(form.get("postalCode")),
      country: safeString(form.get("country"))
    };

    const apiPayload: ApiPayload = {
      provider: safeString(form.get("provider")),
      model: safeString(form.get("model")),
      defaultImageSize: safeString(form.get("defaultImageSize")) || "1024x1024",
      defaultParams: safeString(form.get("defaultParams")),
      apiKey: safeString(form.get("apiKey"))
    };

    const errors = validateOrgPayload(orgPayload);
    if (apiPayload.provider && !PROVIDERS.includes(apiPayload.provider as (typeof PROVIDERS)[number])) {
      errors.push("Provider is invalid.");
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
    }

    const defaultParams = parseDefaultParams(apiPayload.defaultParams);
    const logoFile = form.get("logo") instanceof File ? (form.get("logo") as File) : null;

    let logoPath: string | null | undefined = undefined;
    if (logoFile && logoFile.size > 0) {
      logoPath = await uploadOrganizationLogo(organization.id, logoFile);
    }

    const { error: orgUpdateError } = await adminClient
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
        ...(logoPath !== undefined ? { logo_storage_path: logoPath } : {})
      })
      .eq("id", organization.id);

    if (orgUpdateError) {
      throw new RequestAuthError(orgUpdateError.message, 500);
    }

    const { data: existingSetting, error: existingError } = await adminClient
      .from("api_settings")
      .select("encrypted_api_key")
      .eq("organization_id", organization.id)
      .maybeSingle();

    if (existingError) {
      throw new RequestAuthError(existingError.message, 500);
    }

    const encryptedApiKey =
      apiPayload.apiKey.length > 0
        ? encryptSecret(apiPayload.apiKey)
        : existingSetting?.encrypted_api_key ?? null;

    const { error: settingsError } = await adminClient.from("api_settings").upsert(
      {
        organization_id: organization.id,
        provider: nullable(apiPayload.provider),
        model: nullable(apiPayload.model),
        default_image_size: nullable(apiPayload.defaultImageSize),
        default_params: defaultParams,
        encrypted_api_key: encryptedApiKey,
        updated_by: user.id
      },
      {
        onConflict: "organization_id"
      }
    );

    if (settingsError) {
      throw new RequestAuthError(settingsError.message, 500);
    }

    const payload = await getSettingsPayload(organization.id);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof Error && error.message.includes("JSON")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
