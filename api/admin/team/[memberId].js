import { requireAdmin } from "../../_lib/auth.js";
import { HttpError, allowMethod, getJsonBody, sendJson } from "../../_lib/http.js";
import { getSupabaseAdminClient } from "../../_lib/supabase.js";

function parseRole(value) {
  return value === "admin" || value === "editor" || value === "viewer" ? value : null;
}

function parseDisplayName(value) {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, 80);
}

function isMissingDisplayNameColumn(error) {
  const message = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "");
  return code === "42703" || (message.includes("display_name") && message.includes("column"));
}

async function updateUserMetadataDisplayName(adminClient, userId, displayName) {
  const { data: userRecord, error: userLookupError } = await adminClient.auth.admin.getUserById(userId);

  if (userLookupError || !userRecord?.user) {
    throw new HttpError(userLookupError?.message ?? "User not found.", 500);
  }

  const currentMetadata =
    userRecord.user.user_metadata && typeof userRecord.user.user_metadata === "object"
      ? userRecord.user.user_metadata
      : {};

  const nextMetadata = {
    ...currentMetadata,
    full_name: displayName || null,
    name: displayName || null
  };

  const { error: userUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
    user_metadata: nextMetadata
  });

  if (userUpdateError) {
    throw new HttpError(userUpdateError.message, 500);
  }
}

function getMemberId(req) {
  if (req.query?.memberId) {
    return String(req.query.memberId);
  }

  const match = req.url?.match(/\/api\/admin\/team\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["PATCH", "DELETE"])) return;

  try {
    const { organization, user } = await requireAdmin(req);
    const adminClient = getSupabaseAdminClient();
    const memberId = getMemberId(req);

    if (!memberId) {
      sendJson(res, 400, { error: "Missing team member id." });
      return;
    }

    if (req.method === "PATCH") {
      const body = (await getJsonBody(req)) ?? {};
      const role = body.role === undefined ? undefined : parseRole(body.role);
      const displayName = body.displayName === undefined ? undefined : parseDisplayName(body.displayName);

      if (role === null) {
        sendJson(res, 400, { error: "Valid role is required when provided." });
        return;
      }

      if (displayName === undefined && role === undefined) {
        sendJson(res, 400, { error: "Nothing to update." });
        return;
      }

      const { data: existingMember, error: lookupError } = await adminClient
        .from("team_members")
        .select("id, user_id")
        .eq("id", memberId)
        .eq("organization_id", organization.id)
        .single();

      if (lookupError || !existingMember) {
        sendJson(res, 404, { error: "Team member not found." });
        return;
      }

      if (role && existingMember.user_id === user.id && role !== "admin") {
        sendJson(res, 400, { error: "You cannot remove your own admin access." });
        return;
      }

      if (role) {
        const { error: updateError } = await adminClient
          .from("team_members")
          .update({ role })
          .eq("id", memberId)
          .eq("organization_id", organization.id);

        if (updateError) {
          throw new HttpError(updateError.message, 500);
        }
      }

      if (displayName !== undefined) {
        const { error: profileUpdateError } = await adminClient
          .from("team_members")
          .update({ display_name: displayName || null })
          .eq("id", memberId)
          .eq("organization_id", organization.id);

        if (profileUpdateError) {
          if (isMissingDisplayNameColumn(profileUpdateError)) {
            await updateUserMetadataDisplayName(adminClient, existingMember.user_id, displayName);
          } else {
            throw new HttpError(profileUpdateError.message, 500);
          }
        }
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    const { data: existingMember, error: lookupError } = await adminClient
      .from("team_members")
      .select("id, user_id")
      .eq("id", memberId)
      .eq("organization_id", organization.id)
      .single();

    if (lookupError || !existingMember) {
      sendJson(res, 404, { error: "Team member not found." });
      return;
    }

    if (existingMember.user_id === user.id) {
      sendJson(res, 400, { error: "You cannot remove yourself." });
      return;
    }

    const { error: deleteError } = await adminClient
      .from("team_members")
      .delete()
      .eq("id", memberId)
      .eq("organization_id", organization.id);

    if (deleteError) {
      throw new HttpError(deleteError.message, 500);
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
