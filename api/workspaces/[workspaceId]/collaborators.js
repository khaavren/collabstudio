import { getAuthenticatedUser } from "../../_lib/auth.js";
import { canSendAdminEmail, getWorkspaceInviteUrl, sendWorkspaceInviteEmail } from "../../_lib/email.js";
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
