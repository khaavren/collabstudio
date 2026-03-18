import { getAuthenticatedUser } from "../../_lib/auth.js";
import { canSendAdminEmail, getWorkspaceInviteUrl, sendWorkspaceInviteEmail } from "../../_lib/email.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "../../_lib/http.js";
import { getSupabaseAdminClient } from "../../_lib/supabase.js";
import { assertWorkspaceAdmin } from "../../_lib/workspaces.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_PAGE_SIZE = 1000;
const DEFAULT_SEARCH_LIMIT = 8;
const MAX_SEARCH_LIMIT = 20;

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

function candidateValuesForUser(user) {
  const metadata = user?.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const email = normalizeText(user?.email);
  const localPart = email ? email.split("@")[0] : "";
  const displayName = normalizeText(metadataDisplayName(user));
  const preferredUsername = normalizeText(metadata.preferred_username);
  const fullName = normalizeText(metadata.full_name);
  const name = normalizeText(metadata.name);

  return {
    displayName,
    email,
    fullName,
    localPart,
    name,
    preferredUsername
  };
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

function resolveByName(users, identity) {
  const normalizedIdentity = normalizeText(identity);
  if (!normalizedIdentity) return null;

  const scoredMatches = users
    .map((user) => {
      const candidates = candidateValuesForUser(user);
      let score = 0;

      if (candidates.preferredUsername === normalizedIdentity) score = Math.max(score, 500);
      if (candidates.displayName === normalizedIdentity) score = Math.max(score, 400);
      if (candidates.fullName === normalizedIdentity) score = Math.max(score, 350);
      if (candidates.name === normalizedIdentity) score = Math.max(score, 325);
      if (candidates.localPart === normalizedIdentity) score = Math.max(score, 300);
      if (candidates.email === normalizedIdentity) score = Math.max(score, 250);

      return score > 0 ? { score, user } : null;
    })
    .filter(Boolean);

  if (scoredMatches.length === 0) return null;

  const highestScore = Math.max(...scoredMatches.map((entry) => entry.score));
  const matched = scoredMatches.filter((entry) => entry.score === highestScore).map((entry) => entry.user);

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

function parseSearchLimit(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SEARCH_LIMIT;
  return Math.min(parsed, MAX_SEARCH_LIMIT);
}

function workspaceIdFromReq(req) {
  return String(req.query.workspaceId ?? "").trim();
}

function matchScore(candidate, query, exactScore, prefixScore, containsScore) {
  if (!candidate) return 0;
  if (candidate === query) return exactScore;
  if (candidate.startsWith(query)) return prefixScore;
  if (candidate.includes(query)) return containsScore;
  return 0;
}

async function handleSearchUsers(req, res, user, workspaceId) {
  await assertWorkspaceAdmin(user, workspaceId);

  const query = normalizeText(req.query.q);
  if (query.length < 2) {
    sendJson(res, 200, { users: [] });
    return;
  }

  const adminClient = getSupabaseAdminClient();
  const users = await listAllAuthUsers(adminClient);
  const limit = parseSearchLimit(req.query.limit);
  const matches = users
    .map((entry) => {
      const candidates = candidateValuesForUser(entry);
      const score = Math.max(
        matchScore(candidates.preferredUsername, query, 120, 90, 70),
        matchScore(candidates.displayName, query, 110, 85, 65),
        matchScore(candidates.fullName, query, 105, 80, 60),
        matchScore(candidates.name, query, 100, 78, 58),
        matchScore(candidates.localPart, query, 95, 75, 55),
        matchScore(candidates.email, query, 90, 72, 52)
      );

      if (score <= 0 || !candidates.email) return null;

      return {
        id: entry.id,
        email: candidates.email,
        displayName: metadataDisplayName(entry) ?? toDisplayName(candidates.email),
        inviteName: preferredInviteName(entry),
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

  for (const match of matches) {
    if (seenEmails.has(match.email)) continue;
    seenEmails.add(match.email);
    deduped.push({
      id: match.id,
      email: match.email,
      displayName: match.displayName,
      inviteName: match.inviteName
    });

    if (deduped.length >= limit) {
      break;
    }
  }

  sendJson(res, 200, { users: deduped });
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["GET", "POST"])) return;

  try {
    const user = await getAuthenticatedUser(req);
    const workspaceId = workspaceIdFromReq(req);
    if (!workspaceId) {
      sendJson(res, 400, { error: "Missing workspace id." });
      return;
    }

    if (req.method === "GET") {
      await handleSearchUsers(req, res, user, workspaceId);
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

    const { data: workspaceRow, error: workspaceError } = await adminClient
      .from("workspaces")
      .select("id, name")
      .eq("id", workspaceId)
      .maybeSingle();

    if (workspaceError) {
      throw new HttpError(workspaceError.message, 500);
    }

    const workspaceName = String(workspaceRow?.name ?? "").trim() || "your workspace";
    if (!getWorkspaceInviteUrl(req, {
      workspaceId,
      workspaceName,
      email: target.email,
      role,
      hasAccount: Boolean(target.userId)
    })) {
      sendJson(res, 400, {
        error: "Workspace invites are not configured. Set APP_BASE_URL or provide a valid request host."
      });
      return;
    }

    const { data: existingCollaborator, error: existingCollaboratorError } = await adminClient
      .from("workspace_collaborators")
      .select("id, role")
      .eq("workspace_id", workspaceId)
      .eq("email", target.email)
      .maybeSingle();

    if (existingCollaboratorError) {
      throw new HttpError(existingCollaboratorError.message, 500);
    }

    if (existingCollaborator) {
      if (existingCollaborator.role !== role) {
        const { error: updateRoleError } = await adminClient
          .from("workspace_collaborators")
          .update({
            role,
            user_id: target.userId,
            display_name: target.displayName ?? toDisplayName(target.email)
          })
          .eq("id", existingCollaborator.id);

        if (updateRoleError) {
          throw new HttpError(updateRoleError.message, 500);
        }
      }

      const invitePayload = {
        workspaceId,
        workspaceName,
        email: target.email,
        displayName: target.displayName ?? toDisplayName(target.email),
        role,
        hasAccount: Boolean(target.userId),
        senderEmail: user.email ?? null
      };
      const inviteUrl = getWorkspaceInviteUrl(req, invitePayload);
      let emailed = false;

      if (canSendAdminEmail()) {
        await sendWorkspaceInviteEmail(req, invitePayload);
        emailed = true;
      }

      sendJson(res, 200, {
        ok: true,
        invitedUserExists: Boolean(target.userId),
        onboardingUrl: inviteUrl,
        emailed,
        message:
          existingCollaborator.role === role
            ? "This collaborator already has workspace access."
            : "Collaborator access already existed. Role updated."
      });
      return;
    }

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

    const invitePayload = {
      workspaceId,
      workspaceName,
      email: target.email,
      displayName: target.displayName ?? toDisplayName(target.email),
      role,
      hasAccount: Boolean(target.userId),
      senderEmail: user.email ?? null
    };

    const inviteUrl = getWorkspaceInviteUrl(req, invitePayload);
    let emailed = false;

    if (canSendAdminEmail()) {
      await sendWorkspaceInviteEmail(req, invitePayload);
      emailed = true;
    }

    sendJson(res, 200, {
      ok: true,
      invitedUserExists: Boolean(target.userId),
      onboardingUrl: inviteUrl,
      emailed,
      message: emailed
        ? target.userId
          ? "Invitation emailed with a login link."
          : "Invitation emailed with an onboarding link."
        : target.userId
          ? "Invitation created. Share the login link with this collaborator."
          : "Invitation created. Share the onboarding link with this collaborator."
    });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    sendJson(res, 500, { error: "Unexpected server error." });
  }
}
