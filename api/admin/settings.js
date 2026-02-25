import { readFile } from "node:fs/promises";
import path from "node:path";
import { encryptSecret } from "../_lib/encryption.js";
import { requireAdmin } from "../_lib/auth.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "../_lib/http.js";
import { getSupabaseAdminClient } from "../_lib/supabase.js";

const PROVIDERS = new Set(["OpenAI", "Replicate", "Stability", "Custom HTTP"]);

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

async function loadTeamMembersWithEmails(organizationId) {
  const adminClient = getSupabaseAdminClient();

  const { data: members, error: membersError } = await adminClient
    .from("team_members")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (membersError) {
    throw new HttpError(membersError.message, 500);
  }

  const { data: usersPage, error: usersError } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (usersError) {
    throw new HttpError(usersError.message, 500);
  }

  const userMap = new Map(usersPage.users.map((entry) => [entry.id, entry]));

  return (members ?? []).map((member) => ({
    ...member,
    role: parseRole(member.role),
    email: userMap.get(member.user_id)?.email ?? null,
    displayName:
      userMap.get(member.user_id)?.user_metadata?.full_name ??
      userMap.get(member.user_id)?.user_metadata?.name ??
      null
  }));
}

async function getSettingsPayload(organizationId) {
  const adminClient = getSupabaseAdminClient();
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [organizationQuery, apiSettingsQuery, usageQuery, bucketQuery, appVersion, teamMembers] =
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
      loadTeamMembersWithEmails(organizationId)
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
    }
  };
}

async function handleGet(req, res) {
  const { organization } = await requireAdmin(req);
  const payload = await getSettingsPayload(organization.id);
  sendJson(res, 200, payload);
}

async function handlePost(req, res) {
  const { organization, user } = await requireAdmin(req);
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
    provider: String(apiInput.provider ?? "").trim(),
    model: String(apiInput.model ?? "").trim(),
    defaultImageSize: String(apiInput.defaultImageSize ?? "1024x1024").trim() || "1024x1024",
    defaultParams: String(apiInput.defaultParams ?? "{}"),
    apiKey: String(apiInput.apiKey ?? "").trim()
  };

  const errors = validateOrg(orgPayload);

  if (apiPayload.provider && !PROVIDERS.has(apiPayload.provider)) {
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
    .select("encrypted_api_key")
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (settingsLookupError) {
    throw new HttpError(settingsLookupError.message, 500);
  }

  const encryptedApiKey =
    apiPayload.apiKey.length > 0
      ? encryptSecret(apiPayload.apiKey)
      : existingSettings?.encrypted_api_key ?? null;

  const { error: upsertError } = await adminClient.from("api_settings").upsert(
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

  if (upsertError) {
    throw new HttpError(upsertError.message, 500);
  }

  const payload = await getSettingsPayload(organization.id);
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
