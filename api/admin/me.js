import { requireAdmin } from "../_lib/auth.js";
import { HttpError, allowMethod, sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  if (!allowMethod(req, res, ["GET"])) return;

  try {
    const { organization, membership, user } = await requireAdmin(req);

    sendJson(res, 200, {
      authorized: true,
      organizationId: organization.id,
      role: membership.role,
      email: user.email ?? null
    });
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 403) {
        sendJson(res, 403, { authorized: false, message: "Not authorized" });
        return;
      }

      sendJson(res, error.status, { error: error.message });
      return;
    }

    sendJson(res, 500, { error: "Unexpected server error." });
  }
}
