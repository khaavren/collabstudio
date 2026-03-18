import { getAuthenticatedUser } from "../../_lib/auth.js";
import { HttpError, allowMethod, sendJson } from "../../_lib/http.js";
import { getSupabaseAdminClient } from "../../_lib/supabase.js";
import { assertWorkspaceAdmin } from "../../_lib/workspaces.js";

const AUTH_PAGE_SIZE = 1000;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function toDisplayName(email) {
  return String(email)
    .split("@")[0]
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

  return "User";
}

function preferredInviteName(user) {
  const metadata = user?.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const values = [metadata.preferred_username, metadata.display_name, metadata.full_name, metadata.name];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }

  if (typeof user?.email === "string" && user.email.includes("@")) {
    return user.email.split("@")[0];
  }

  return "user";
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

function matchScore(candidate, query, exactScore, prefixScore, containsScore) {
  if (!candidate) return 0;
  if (candidate === query) return exactScore;
  if (candidate.startsWith(query)) return prefixScore;
  if (candidate.includes(query)) return containsScore;
  return 0;
}

function searchUsers(users, query, limit) {
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length < 2) return [];

  const scored = users
    .map((user) => {
      const email = normalizeText(user.email);
      if (!email) return null;

      const localPart = email.split("@")[0] ?? "";
      const metadata = user?.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
      const preferredUsername = normalizeText(metadata.preferred_username);
      const displayName = normalizeText(metadataDisplayName(user));
      const fullName = normalizeText(metadata.full_name);
      const name = normalizeText(metadata.name);

      const score = Math.max(
        matchScore(preferredUsername, normalizedQuery, 120, 90, 70),
        matchScore(displayName, normalizedQuery, 110, 85, 65),
        matchScore(fullName, normalizedQuery, 105, 80, 60),
        matchScore(name, normalizedQuery, 100, 78, 58),
        matchScore(localPart, normalizedQuery, 95, 75, 55),
        matchScore(email, normalizedQuery, 90, 72, 52)
      );

      if (score <= 0) return null;

      return {
        id: user.id,
        email,
        displayName: metadataDisplayName(user),
        inviteName: preferredInviteName(user),
        score
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.displayName.localeCompare(right.displayName);
    });

  const deduped = [];
  const seenEmails = new Set();

  for (const entry of scored) {
    if (seenEmails.has(entry.email)) continue;
    seenEmails.add(entry.email);
    deduped.push({
      id: entry.id,
      email: entry.email,
      displayName: entry.displayName,
      inviteName: entry.inviteName
    });

    if (deduped.length >= limit) {
      break;
    }
  }

  return deduped;
}

function parseLimit(req) {
  const raw = Number.parseInt(String(req.query.limit ?? ""), 10);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(raw, MAX_LIMIT);
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["GET"])) return;

  try {
    const user = await getAuthenticatedUser(req);
    const workspaceId = String(req.query.workspaceId ?? "").trim();
    const query = String(req.query.q ?? "").trim();

    if (!workspaceId) {
      sendJson(res, 400, { error: "Missing workspace id." });
      return;
    }

    await assertWorkspaceAdmin(user, workspaceId);

    if (query.length < 2) {
      sendJson(res, 200, { users: [] });
      return;
    }

    const adminClient = getSupabaseAdminClient();
    const users = await listAllAuthUsers(adminClient);
    const matches = searchUsers(users, query, parseLimit(req));

    sendJson(res, 200, { users: matches });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    sendJson(res, 500, { error: "Unexpected server error." });
  }
}
