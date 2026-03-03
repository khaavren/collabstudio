import { getAuthenticatedUser } from "../../_lib/auth.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "../../_lib/http.js";
import { getSupabaseAdminClient } from "../../_lib/supabase.js";
import { assertWorkspaceAdmin } from "../../_lib/workspaces.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_PAGE_SIZE = 1000;

function toDisplayName(email) {
  return String(email)
    .split("@")[0]
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function metadataDisplayName(user) {
  const metadata = user?.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const values = [metadata.full_name, metadata.name, metadata.display_name, metadata.preferred_username];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }

  if (typeof user?.email === "string" && user.email.includes("@")) {
    return toDisplayName(user.email);
  }
  return null;
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

function resolveByName(users, identity) {
  const normalizedIdentity = normalizeText(identity);
  if (!normalizedIdentity) return null;

  const matched = users.filter((user) => {
    const candidates = new Set();
    const email = normalizeText(user.email);
    if (email) {
      candidates.add(email);
      const localPart = email.split("@")[0];
      if (localPart) candidates.add(localPart);
    }

    const displayName = normalizeText(metadataDisplayName(user));
    if (displayName) candidates.add(displayName);

    return candidates.has(normalizedIdentity);
  });

  if (matched.length === 0) return null;
  if (matched.length > 1) {
    throw new HttpError(
      "Multiple users match that invite name. Use the user's email address for a unique match.",
      409
    );
  }

  const user = matched[0];
  return {
    email: normalizeText(user.email),
    userId: user.id,
    displayName: metadataDisplayName(user)
  };
}

async function resolveInviteTarget(adminClient, rawIdentity) {
  const identity = normalizeText(rawIdentity);
  if (!identity) {
    throw new HttpError("Invite email or user name is required.", 400);
  }

  const users = await listAllAuthUsers(adminClient);

  if (EMAIL_REGEX.test(identity)) {
    const exactEmailUser = users.find((user) => normalizeText(user.email) === identity);
    return {
      email: identity,
      userId: exactEmailUser?.id ?? null,
      displayName: exactEmailUser ? metadataDisplayName(exactEmailUser) : toDisplayName(identity)
    };
  }

  const resolved = resolveByName(users, identity);
  if (!resolved || !resolved.email) {
    throw new HttpError("No user found for that invite name. Use the user's email address instead.", 404);
  }

  return {
    email: resolved.email,
    userId: resolved.userId ?? null,
    displayName: resolved.displayName ?? toDisplayName(resolved.email)
  };
}

function parseRole(value) {
  return value === "admin" || value === "editor" || value === "viewer" ? value : null;
}

function workspaceIdFromReq(req) {
  return String(req.query.workspaceId ?? "").trim();
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["POST"])) return;

  try {
    const user = await getAuthenticatedUser(req);
    const workspaceId = workspaceIdFromReq(req);
    if (!workspaceId) {
      sendJson(res, 400, { error: "Missing workspace id." });
      return;
    }

    await assertWorkspaceAdmin(user, workspaceId);
    const body = (await getJsonBody(req)) ?? {};
    const inviteIdentity = String(body.identity ?? body.email ?? "").trim();
    const role = parseRole(body.role);

    if (!inviteIdentity || !role) {
      sendJson(res, 400, { error: "Invite email/user name and role are required." });
      return;
    }

    const adminClient = getSupabaseAdminClient();
    const target = await resolveInviteTarget(adminClient, inviteIdentity);
    const { error } = await adminClient.from("workspace_collaborators").insert({
      workspace_id: workspaceId,
      email: target.email,
      user_id: target.userId,
      display_name: target.displayName ?? toDisplayName(target.email),
      role
    });

    if (error) {
      throw new HttpError(error.message, 500);
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    sendJson(res, 500, { error: "Unexpected server error." });
  }
}
