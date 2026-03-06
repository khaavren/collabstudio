import { HttpError } from "./http.js";

function nonEmpty(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getEmailConfig() {
  const apiKey = nonEmpty(process.env.RESEND_API_KEY);
  const from =
    nonEmpty(process.env.ADMIN_EMAIL_FROM) ??
    nonEmpty(process.env.RESEND_FROM_EMAIL) ??
    null;

  return {
    apiKey,
    from
  };
}

export function canSendAdminEmail() {
  const config = getEmailConfig();
  return Boolean(config.apiKey && config.from);
}

export function getAdminLoginUrl(req) {
  const configured =
    nonEmpty(process.env.ADMIN_NOTIFY_LOGIN_URL) ??
    nonEmpty(process.env.APP_LOGIN_URL) ??
    null;

  if (configured) return configured;

  const host = nonEmpty(req.headers["x-forwarded-host"] ?? req.headers.host ?? "");
  if (!host) return null;

  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").trim().toLowerCase();
  const protocol = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : "https";
  return `${protocol}://${host}/login`;
}

export async function sendAdminUserCreatedEmail(req, payload) {
  const { apiKey, from } = getEmailConfig();
  if (!apiKey || !from) {
    throw new HttpError(
      "Notification email is not configured. Set RESEND_API_KEY and ADMIN_EMAIL_FROM.",
      400
    );
  }

  const loginUrl = getAdminLoginUrl(req);
  if (!loginUrl) {
    throw new HttpError(
      "Notification email is not configured. Set ADMIN_NOTIFY_LOGIN_URL or provide a valid request host.",
      400
    );
  }

  const displayName = String(payload.displayName ?? "").trim() || "there";
  const loginEmail = String(payload.email ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  const senderEmail = nonEmpty(payload.senderEmail);

  const subject = "Your MagisterLudi account is ready";
  const text = [
    `Hi ${displayName},`,
    "",
    "An account has been created for you in MagisterLudi.",
    "",
    `Login URL: ${loginUrl}`,
    `Email: ${loginEmail}`,
    `Password: ${password}`,
    "",
    "Sign in and change your password after your first login.",
    senderEmail ? `Created by: ${senderEmail}` : null
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937">
      <p>Hi ${escapeHtml(displayName)},</p>
      <p>An account has been created for you in MagisterLudi.</p>
      <p>
        <strong>Login URL:</strong>
        <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a><br />
        <strong>Email:</strong> ${escapeHtml(loginEmail)}<br />
        <strong>Password:</strong> ${escapeHtml(password)}
      </p>
      <p>Sign in and change your password after your first login.</p>
      ${senderEmail ? `<p><strong>Created by:</strong> ${escapeHtml(senderEmail)}</p>` : ""}
    </div>
  `.trim();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [loginEmail],
      subject,
      text,
      html
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message ?? "").trim()
        : "";
    throw new HttpError(message || "Notification email request failed.", 502);
  }

  return {
    loginUrl
  };
}
