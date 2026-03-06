import { requireAdmin } from "../_lib/auth.js";
import { canSendAdminEmail, getAdminLoginUrl, sendAdminUserCreatedEmail } from "../_lib/email.js";
import { HttpError, getJsonBody, sendJson } from "../_lib/http.js";
import { getSupabaseAdminClient, getSupabaseServerAuthClient } from "../_lib/supabase.js";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const AUTH_PAGE_SIZE = 1000;
const TICKET_STATUSES = new Set(["open", "pending", "solved", "closed"]);
const TICKET_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const USER_SUSPEND_DURATION = "876000h";

function queryValue(req, key) {
  const raw = req.query?.[key];
  if (Array.isArray(raw)) return raw[0] ?? "";
  return typeof raw === "string" ? raw : "";
}

function parsePathInfo(req) {
  const path = String(req.url ?? "").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "admin") {
    return { resource: "" };
  }

  if (parts[2] === "support" && parts[3] === "tickets") {
    const ticketId = parts[4] ?? "";
    const leaf = parts[5] ?? "";
    if (!ticketId) return { resource: "support_tickets" };
    if (!leaf) return { resource: "support_ticket", ticketId };
    if (leaf === "messages") return { resource: "support_ticket_messages", ticketId };
    if (leaf === "notes") return { resource: "support_ticket_notes", ticketId };
    if (leaf === "update") return { resource: "support_ticket_update", ticketId };
  }

  if (parts[2] === "customers") {
    const orgId = parts[3] ?? "";
    if (!orgId) return { resource: "customers" };
    return { resource: "customer", orgId };
  }

  if (parts[2] === "users") {
    const userId = parts[3] ?? "";
    const leaf = parts[4] ?? "";
    if (!userId) return { resource: "users" };
    if (leaf === "suspend") return { resource: "user_suspend", userId };
    if (leaf === "delete") return { resource: "user_delete", userId };
    if (leaf === "reset-password") return { resource: "user_reset_password", userId };
    return { resource: "user", userId };
  }

  if (parts[2] === "audit") {
    return { resource: "audit" };
  }

  if (parts[2] === "system" && parts[3] === "health") {
    return { resource: "system_health" };
  }

  return { resource: "" };
}

function nonEmpty(value) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeQuery(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function toIlikePattern(value) {
  const clean = String(value ?? "")
    .replace(/[%,_]/g, " ")
    .trim();
  if (!clean) return "";
  return `%${clean}%`;
}

function parsePageSize(req) {
  const raw = Number.parseInt(queryValue(req, "limit"), 10);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(raw, MAX_PAGE_SIZE);
}

function parseIsoDate(value) {
  const text = nonEmpty(value);
  if (!text) return null;
  const ts = Date.parse(text);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
}

function parseEmail(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!text) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return null;
  return text;
}

function parsePassword(value) {
  const password = String(value ?? "").trim();
  if (password.length < 8 || password.length > 256) return null;
  return password;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "")
  );
}

function parseDateEpoch(value) {
  const text = nonEmpty(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFutureDate(value) {
  const timestamp = parseDateEpoch(value);
  return timestamp !== null && timestamp > Date.now();
}

function getRequestOrigin(req) {
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").trim();
  if (!host) return null;

  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").trim().toLowerCase();
  const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : "https";
  return `${protocol}://${host}`;
}

function toDisplayNameFromEmail(email) {
  return String(email ?? "")
    .split("@")[0]
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getUserDisplayName(user) {
  const metadata = user?.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const values = [
    metadata.full_name,
    metadata.name,
    metadata.display_name,
    metadata.preferred_username,
    typeof user?.email === "string" ? toDisplayNameFromEmail(user.email) : null
  ];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }

  return "User";
}

function maxIsoDate(...values) {
  let best = null;

  for (const value of values) {
    if (!value) continue;
    const iso = typeof value === "string" ? value : null;
    if (!iso) continue;
    if (!best || Date.parse(iso) > Date.parse(best)) {
      best = iso;
    }
  }

  return best;
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

async function getAuthUsersCached(context) {
  if (!context.authUsers) {
    context.authUsers = await listAllAuthUsers(context.adminClient);
  }
  return context.authUsers;
}

async function getAuthUserMaps(context) {
  if (context.authUserMaps) return context.authUserMaps;

  const users = await getAuthUsersCached(context);
  const byId = new Map();
  const byEmail = new Map();

  for (const user of users) {
    byId.set(user.id, user);
    const email = normalizeQuery(user.email);
    if (email) byEmail.set(email, user);
  }

  context.authUserMaps = { byId, byEmail };
  return context.authUserMaps;
}

async function loadOrganizationsMap(adminClient, organizationIds) {
  const ids = Array.from(new Set((organizationIds ?? []).filter(Boolean)));
  if (ids.length === 0) return new Map();

  const { data, error } = await adminClient
    .from("organizations")
    .select("id, name, slug, contact_email, created_at, updated_at")
    .in("id", ids);

  if (error) {
    throw new HttpError(error.message, 500);
  }

  return new Map((data ?? []).map((row) => [row.id, row]));
}

async function recordAuditEvent(context, payload) {
  const { adminClient, actor } = context;

  const { error } = await adminClient.from("audit_events").insert({
    organization_id: payload.organizationId ?? null,
    actor_user_id: actor.id,
    actor_email: actor.email ?? null,
    action: payload.action,
    target_type: payload.targetType ?? null,
    target_id: payload.targetId ?? null,
    metadata: payload.metadata ?? {}
  });

  if (error) {
    throw new HttpError(error.message, 500);
  }
}

function validateTicketStatus(status) {
  return typeof status === "string" && TICKET_STATUSES.has(status) ? status : null;
}

function validateTicketPriority(priority) {
  return typeof priority === "string" && TICKET_PRIORITIES.has(priority) ? priority : null;
}

async function handleSupportTicketsList(req, res, context) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const statusFilter = validateTicketStatus(queryValue(req, "status"));
  const priorityFilter = validateTicketPriority(queryValue(req, "priority"));
  const orgIdFilter = nonEmpty(queryValue(req, "orgId"));
  const qRaw = nonEmpty(queryValue(req, "q"));
  const pageSize = parsePageSize(req);
  const limit = qRaw ? MAX_PAGE_SIZE : pageSize;

  let query = context.adminClient
    .from("support_tickets")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (statusFilter) query = query.eq("status", statusFilter);
  if (priorityFilter) query = query.eq("priority", priorityFilter);
  if (orgIdFilter) query = query.eq("organization_id", orgIdFilter);

  const { data, error } = await query;
  if (error) {
    throw new HttpError(error.message, 500);
  }

  let rows = data ?? [];

  const orgMap = await loadOrganizationsMap(
    context.adminClient,
    rows.map((row) => row.organization_id)
  );

  if (qRaw) {
    const q = normalizeQuery(qRaw);
    rows = rows.filter((row) => {
      const org = orgMap.get(row.organization_id);
      const fields = [
        String(row.id ?? "").toLowerCase(),
        String(row.subject ?? "").toLowerCase(),
        String(row.requester_email ?? "").toLowerCase(),
        String(row.category ?? "").toLowerCase(),
        String(org?.name ?? "").toLowerCase(),
        String(org?.slug ?? "").toLowerCase()
      ];
      return fields.some((value) => value.includes(q));
    });
  }
  const { byId: usersById } = await getAuthUserMaps(context);

  sendJson(res, 200, {
    tickets: rows.map((row) => {
      const assignee = row.assignee_user_id ? usersById.get(row.assignee_user_id) : null;
      return {
        id: row.id,
        organizationId: row.organization_id,
        organizationName: orgMap.get(row.organization_id)?.name ?? null,
        requesterEmail: row.requester_email,
        requesterUserId: row.requester_user_id,
        subject: row.subject,
        status: row.status,
        priority: row.priority,
        category: row.category,
        assigneeUserId: row.assignee_user_id,
        assigneeEmail: assignee?.email ?? null,
        assigneeName: assignee ? getUserDisplayName(assignee) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    })
  });
}

async function handleSupportTicketCreate(req, res, context) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const body = (await getJsonBody(req)) ?? {};
  const subject = nonEmpty(body.subject);
  const requesterEmail = normalizeQuery(body.requesterEmail);
  const requesterUserId = nonEmpty(body.requesterUserId);
  const organizationId = nonEmpty(body.organizationId);
  const category = nonEmpty(body.category);
  const status = validateTicketStatus(body.status ?? "open") ?? "open";
  const priority = validateTicketPriority(body.priority ?? "normal") ?? "normal";

  if (!subject) {
    sendJson(res, 400, { error: "Ticket subject is required." });
    return;
  }

  if (!requesterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
    sendJson(res, 400, { error: "Requester email is invalid." });
    return;
  }

  if (requesterUserId && !isUuid(requesterUserId)) {
    sendJson(res, 400, { error: "Requester user id is invalid." });
    return;
  }

  if (organizationId && !isUuid(organizationId)) {
    sendJson(res, 400, { error: "Organization id is invalid." });
    return;
  }

  const { data, error } = await context.adminClient
    .from("support_tickets")
    .insert({
      organization_id: organizationId,
      requester_email: requesterEmail,
      requester_user_id: requesterUserId,
      subject,
      status,
      priority,
      category
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new HttpError(error?.message ?? "Unable to create ticket.", 500);
  }

  await recordAuditEvent(context, {
    organizationId: organizationId,
    action: "support.ticket.created",
    targetType: "support_ticket",
    targetId: data.id,
    metadata: {
      status,
      priority,
      requesterEmail
    }
  });

  sendJson(res, 200, {
    ticket: {
      id: data.id,
      organizationId: data.organization_id,
      requesterEmail: data.requester_email,
      requesterUserId: data.requester_user_id,
      subject: data.subject,
      status: data.status,
      priority: data.priority,
      category: data.category,
      assigneeUserId: data.assignee_user_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    }
  });
}

async function loadOrgMembersWithUserInfo(context, organizationId) {
  if (!organizationId) return [];

  const { data, error } = await context.adminClient
    .from("team_members")
    .select("id, organization_id, user_id, role, display_name, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) throw new HttpError(error.message, 500);

  const { byId } = await getAuthUserMaps(context);

  return (data ?? []).map((member) => {
    const user = byId.get(member.user_id);
    return {
      id: member.id,
      organizationId: member.organization_id,
      userId: member.user_id,
      role: member.role,
      displayName: member.display_name?.trim() || (user ? getUserDisplayName(user) : null),
      email: user?.email ?? null,
      createdAt: member.created_at
    };
  });
}

async function handleSupportTicketDetail(req, res, context, ticketId) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (!isUuid(ticketId)) {
    sendJson(res, 400, { error: "Ticket id is invalid." });
    return;
  }

  const { data: ticket, error: ticketError } = await context.adminClient
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();

  if (ticketError) throw new HttpError(ticketError.message, 500);
  if (!ticket) {
    sendJson(res, 404, { error: "Ticket not found." });
    return;
  }

  const [{ data: messages, error: messagesError }, { data: notes, error: notesError }] = await Promise.all([
    context.adminClient
      .from("support_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true }),
    context.adminClient
      .from("support_internal_notes")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true })
  ]);

  if (messagesError) throw new HttpError(messagesError.message, 500);
  if (notesError) throw new HttpError(notesError.message, 500);

  const orgMap = await loadOrganizationsMap(context.adminClient, [ticket.organization_id]);
  const members = await loadOrgMembersWithUserInfo(context, ticket.organization_id);
  const { byId } = await getAuthUserMaps(context);
  const requester = ticket.requester_user_id ? byId.get(ticket.requester_user_id) : null;
  const assignee = ticket.assignee_user_id ? byId.get(ticket.assignee_user_id) : null;

  sendJson(res, 200, {
    ticket: {
      id: ticket.id,
      organizationId: ticket.organization_id,
      organizationName: orgMap.get(ticket.organization_id)?.name ?? null,
      requesterEmail: ticket.requester_email,
      requesterUserId: ticket.requester_user_id,
      requesterName: requester ? getUserDisplayName(requester) : null,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      assigneeUserId: ticket.assignee_user_id,
      assigneeName: assignee ? getUserDisplayName(assignee) : null,
      assigneeEmail: assignee?.email ?? null,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at
    },
    organization: orgMap.get(ticket.organization_id) ?? null,
    organizationMembers: members,
    messages: (messages ?? []).map((entry) => {
      const author = entry.author_user_id ? byId.get(entry.author_user_id) : null;
      return {
        id: entry.id,
        ticketId: entry.ticket_id,
        authorType: entry.author_type,
        authorUserId: entry.author_user_id,
        authorName: author ? getUserDisplayName(author) : entry.author_type === "customer" ? ticket.requester_email : "Admin",
        authorEmail: author?.email ?? (entry.author_type === "customer" ? ticket.requester_email : null),
        body: entry.body,
        attachments: Array.isArray(entry.attachments) ? entry.attachments : [],
        createdAt: entry.created_at
      };
    }),
    internalNotes: (notes ?? []).map((entry) => {
      const author = byId.get(entry.admin_user_id);
      return {
        id: entry.id,
        ticketId: entry.ticket_id,
        adminUserId: entry.admin_user_id,
        adminName: author ? getUserDisplayName(author) : "Admin",
        adminEmail: author?.email ?? null,
        body: entry.body,
        createdAt: entry.created_at
      };
    })
  });
}

async function touchTicket(context, ticketId) {
  const { error } = await context.adminClient
    .from("support_tickets")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", ticketId);

  if (error) {
    throw new HttpError(error.message, 500);
  }
}

async function handleSupportTicketMessage(req, res, context, ticketId) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (!isUuid(ticketId)) {
    sendJson(res, 400, { error: "Ticket id is invalid." });
    return;
  }

  const body = (await getJsonBody(req)) ?? {};
  const messageBody = nonEmpty(body.body);
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!messageBody) {
    sendJson(res, 400, { error: "Message body is required." });
    return;
  }

  const { data: ticket, error: ticketError } = await context.adminClient
    .from("support_tickets")
    .select("id, organization_id")
    .eq("id", ticketId)
    .maybeSingle();

  if (ticketError) throw new HttpError(ticketError.message, 500);
  if (!ticket) {
    sendJson(res, 404, { error: "Ticket not found." });
    return;
  }

  const { data, error } = await context.adminClient
    .from("support_messages")
    .insert({
      ticket_id: ticketId,
      author_type: "admin",
      author_user_id: context.actor.id,
      body: messageBody,
      attachments
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new HttpError(error?.message ?? "Unable to post message.", 500);
  }

  await touchTicket(context, ticketId);

  await recordAuditEvent(context, {
    organizationId: ticket.organization_id,
    action: "support.ticket.message_posted",
    targetType: "support_ticket",
    targetId: ticketId,
    metadata: {
      messageId: data.id
    }
  });

  sendJson(res, 200, {
    message: {
      id: data.id,
      ticketId: data.ticket_id,
      authorType: data.author_type,
      authorUserId: data.author_user_id,
      body: data.body,
      attachments: Array.isArray(data.attachments) ? data.attachments : [],
      createdAt: data.created_at
    }
  });
}

async function handleSupportTicketNote(req, res, context, ticketId) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (!isUuid(ticketId)) {
    sendJson(res, 400, { error: "Ticket id is invalid." });
    return;
  }

  const body = (await getJsonBody(req)) ?? {};
  const noteBody = nonEmpty(body.body);

  if (!noteBody) {
    sendJson(res, 400, { error: "Internal note body is required." });
    return;
  }

  const { data: ticket, error: ticketError } = await context.adminClient
    .from("support_tickets")
    .select("id, organization_id")
    .eq("id", ticketId)
    .maybeSingle();

  if (ticketError) throw new HttpError(ticketError.message, 500);
  if (!ticket) {
    sendJson(res, 404, { error: "Ticket not found." });
    return;
  }

  const { data, error } = await context.adminClient
    .from("support_internal_notes")
    .insert({
      ticket_id: ticketId,
      admin_user_id: context.actor.id,
      body: noteBody
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new HttpError(error?.message ?? "Unable to save note.", 500);
  }

  await touchTicket(context, ticketId);

  await recordAuditEvent(context, {
    organizationId: ticket.organization_id,
    action: "support.ticket.note_added",
    targetType: "support_ticket",
    targetId: ticketId,
    metadata: {
      noteId: data.id
    }
  });

  sendJson(res, 200, {
    note: {
      id: data.id,
      ticketId: data.ticket_id,
      adminUserId: data.admin_user_id,
      body: data.body,
      createdAt: data.created_at
    }
  });
}

async function handleSupportTicketUpdate(req, res, context, ticketId) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (!isUuid(ticketId)) {
    sendJson(res, 400, { error: "Ticket id is invalid." });
    return;
  }

  const body = (await getJsonBody(req)) ?? {};
  const status = body.status === undefined ? undefined : validateTicketStatus(body.status);
  const priority = body.priority === undefined ? undefined : validateTicketPriority(body.priority);
  const assigneeUserId = body.assigneeUserId === undefined ? undefined : nonEmpty(body.assigneeUserId);
  const category = body.category === undefined ? undefined : nonEmpty(body.category);
  const subject = body.subject === undefined ? undefined : nonEmpty(body.subject);

  if (body.status !== undefined && !status) {
    sendJson(res, 400, { error: "Status is invalid." });
    return;
  }

  if (body.priority !== undefined && !priority) {
    sendJson(res, 400, { error: "Priority is invalid." });
    return;
  }

  if (assigneeUserId && !isUuid(assigneeUserId)) {
    sendJson(res, 400, { error: "Assignee user id is invalid." });
    return;
  }

  const patch = {
    ...(status !== undefined ? { status } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(assigneeUserId !== undefined ? { assignee_user_id: assigneeUserId } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(subject !== undefined ? { subject } : {}),
    updated_at: new Date().toISOString()
  };

  if (Object.keys(patch).length === 1) {
    sendJson(res, 400, { error: "No valid ticket fields to update." });
    return;
  }

  const { data, error } = await context.adminClient
    .from("support_tickets")
    .update(patch)
    .eq("id", ticketId)
    .select("*")
    .maybeSingle();

  if (error) throw new HttpError(error.message, 500);
  if (!data) {
    sendJson(res, 404, { error: "Ticket not found." });
    return;
  }

  await recordAuditEvent(context, {
    organizationId: data.organization_id,
    action: "support.ticket.updated",
    targetType: "support_ticket",
    targetId: ticketId,
    metadata: {
      changedFields: Object.keys(patch)
    }
  });

  sendJson(res, 200, {
    ticket: {
      id: data.id,
      organizationId: data.organization_id,
      requesterEmail: data.requester_email,
      requesterUserId: data.requester_user_id,
      subject: data.subject,
      status: data.status,
      priority: data.priority,
      category: data.category,
      assigneeUserId: data.assignee_user_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    }
  });
}

async function handleCustomersList(req, res, context) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const qRaw = nonEmpty(queryValue(req, "q"));
  const pageSize = parsePageSize(req);

  let query = context.adminClient
    .from("organizations")
    .select("id, name, slug, contact_email, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(pageSize);

  if (qRaw) {
    const pattern = toIlikePattern(qRaw);
    if (pattern) {
      query = query.or(`name.ilike.${pattern},slug.ilike.${pattern},contact_email.ilike.${pattern}`);
    }
  }

  const { data: organizations, error: organizationsError } = await query;
  if (organizationsError) throw new HttpError(organizationsError.message, 500);

  const orgRows = organizations ?? [];
  const orgIds = orgRows.map((org) => org.id);

  if (orgIds.length === 0) {
    sendJson(res, 200, { customers: [] });
    return;
  }

  const [membersQuery, settingsQuery, ticketsQuery] = await Promise.all([
    context.adminClient
      .from("team_members")
      .select("organization_id, user_id")
      .in("organization_id", orgIds),
    context.adminClient
      .from("api_settings")
      .select("organization_id, provider, encrypted_api_key, updated_at")
      .in("organization_id", orgIds),
    context.adminClient
      .from("support_tickets")
      .select("organization_id, status")
      .in("organization_id", orgIds)
  ]);

  if (membersQuery.error) throw new HttpError(membersQuery.error.message, 500);
  if (settingsQuery.error) throw new HttpError(settingsQuery.error.message, 500);
  if (ticketsQuery.error) throw new HttpError(ticketsQuery.error.message, 500);

  const members = membersQuery.data ?? [];
  const orgMemberCounts = new Map();
  const userToOrgs = new Map();

  for (const member of members) {
    orgMemberCounts.set(member.organization_id, (orgMemberCounts.get(member.organization_id) ?? 0) + 1);
    if (!member.user_id) continue;
    const current = userToOrgs.get(member.user_id) ?? new Set();
    current.add(member.organization_id);
    userToOrgs.set(member.user_id, current);
  }

  const memberUserIds = Array.from(new Set(members.map((member) => member.user_id).filter(Boolean)));
  let workspaces = [];
  if (memberUserIds.length > 0) {
    const { data, error } = await context.adminClient
      .from("workspaces")
      .select("id, owner_id, updated_at, created_at")
      .in("owner_id", memberUserIds);

    if (error) throw new HttpError(error.message, 500);
    workspaces = data ?? [];
  }

  const orgWorkspaceCounts = new Map();
  const orgLastWorkspaceActivity = new Map();
  for (const workspace of workspaces) {
    const orgSet = userToOrgs.get(workspace.owner_id) ?? new Set();
    for (const orgId of orgSet) {
      orgWorkspaceCounts.set(orgId, (orgWorkspaceCounts.get(orgId) ?? 0) + 1);
      const last = orgLastWorkspaceActivity.get(orgId) ?? null;
      orgLastWorkspaceActivity.set(orgId, maxIsoDate(last, workspace.updated_at ?? workspace.created_at));
    }
  }

  const settingsByOrg = new Map((settingsQuery.data ?? []).map((entry) => [entry.organization_id, entry]));
  const orgOpenTicketCounts = new Map();
  for (const ticket of ticketsQuery.data ?? []) {
    if (ticket.status === "open" || ticket.status === "pending") {
      orgOpenTicketCounts.set(
        ticket.organization_id,
        (orgOpenTicketCounts.get(ticket.organization_id) ?? 0) + 1
      );
    }
  }

  sendJson(res, 200, {
    customers: orgRows.map((org) => {
      const apiSettings = settingsByOrg.get(org.id);
      const configured = Boolean(apiSettings?.provider && apiSettings?.encrypted_api_key);
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        contactEmail: org.contact_email,
        memberCount: orgMemberCounts.get(org.id) ?? 0,
        workspaceCount: orgWorkspaceCounts.get(org.id) ?? 0,
        openTicketCount: orgOpenTicketCounts.get(org.id) ?? 0,
        modelConfigured: configured,
        updatedAt: org.updated_at,
        lastActivityAt: maxIsoDate(org.updated_at, orgLastWorkspaceActivity.get(org.id) ?? null)
      };
    })
  });
}

async function loadCustomerDetail(context, orgId, options = { includeExport: false }) {
  const { adminClient } = context;

  const { data: organization, error: orgError } = await adminClient
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError) throw new HttpError(orgError.message, 500);
  if (!organization) {
    throw new HttpError("Organization not found.", 404);
  }

  const [{ data: members, error: membersError }, { data: apiSettings, error: apiSettingsError }] = await Promise.all([
    adminClient
      .from("team_members")
      .select("id, organization_id, user_id, role, display_name, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true }),
    adminClient
      .from("api_settings")
      .select("organization_id, provider, model, encrypted_api_key, updated_at")
      .eq("organization_id", orgId)
      .maybeSingle()
  ]);

  if (membersError) throw new HttpError(membersError.message, 500);
  if (apiSettingsError) throw new HttpError(apiSettingsError.message, 500);

  const { byId } = await getAuthUserMaps(context);
  const memberRows = (members ?? []).map((member) => {
    const user = byId.get(member.user_id);
    return {
      id: member.id,
      userId: member.user_id,
      role: member.role,
      displayName: member.display_name?.trim() || (user ? getUserDisplayName(user) : null),
      email: user?.email ?? null,
      createdAt: member.created_at
    };
  });

  const memberUserIds = Array.from(new Set(memberRows.map((member) => member.userId).filter(Boolean)));

  const { data: tickets, error: ticketsError } = await adminClient
    .from("support_tickets")
    .select("*")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (ticketsError) throw new HttpError(ticketsError.message, 500);

  let workspaces = [];
  if (memberUserIds.length > 0) {
    const { data, error } = await adminClient
      .from("workspaces")
      .select("*")
      .in("owner_id", memberUserIds)
      .order("updated_at", { ascending: false });

    if (error) throw new HttpError(error.message, 500);
    workspaces = data ?? [];
  }

  const workspaceIds = workspaces.map((workspace) => workspace.id);

  let rooms = [];
  let collaborators = [];
  if (workspaceIds.length > 0) {
    const [roomsQuery, collaboratorsQuery] = await Promise.all([
      adminClient.from("rooms").select("*").in("workspace_id", workspaceIds),
      adminClient.from("workspace_collaborators").select("*").in("workspace_id", workspaceIds)
    ]);

    if (roomsQuery.error) throw new HttpError(roomsQuery.error.message, 500);
    if (collaboratorsQuery.error) throw new HttpError(collaboratorsQuery.error.message, 500);

    rooms = roomsQuery.data ?? [];
    collaborators = collaboratorsQuery.data ?? [];
  }

  const roomIds = rooms.map((room) => room.id);

  let assets = [];
  if (roomIds.length > 0) {
    const { data, error } = await adminClient.from("assets").select("*").in("room_id", roomIds);
    if (error) throw new HttpError(error.message, 500);
    assets = data ?? [];
  }

  const assetIds = assets.map((asset) => asset.id);

  let assetVersions = [];
  let comments = [];
  if (assetIds.length > 0) {
    const [versionsQuery, commentsQuery] = await Promise.all([
      adminClient.from("asset_versions").select("id, asset_id, created_at, version, prompt, output_type, editor").in("asset_id", assetIds),
      adminClient.from("comments").select("id, asset_id, created_at, author, content").in("asset_id", assetIds)
    ]);

    if (versionsQuery.error) throw new HttpError(versionsQuery.error.message, 500);
    if (commentsQuery.error) throw new HttpError(commentsQuery.error.message, 500);

    assetVersions = versionsQuery.data ?? [];
    comments = commentsQuery.data ?? [];
  }

  const recentActivityAt = maxIsoDate(
    organization.updated_at,
    ...workspaces.map((workspace) => workspace.updated_at ?? workspace.created_at),
    ...tickets.map((ticket) => ticket.updated_at ?? ticket.created_at),
    ...comments.map((comment) => comment.created_at),
    ...assetVersions.map((version) => version.created_at)
  );

  const details = {
    organization,
    members: memberRows,
    diagnostics: {
      modelApiConfigured: Boolean(apiSettings?.provider && apiSettings?.encrypted_api_key),
      modelProvider: apiSettings?.provider ?? null,
      model: apiSettings?.model ?? null,
      lastGenerationAttemptAt: maxIsoDate(...assetVersions.map((version) => version.created_at)),
      approxStorageMb: Number(((assets.length + assetVersions.length) * 1.2).toFixed(1)),
      recentActivityAt,
      workspaceCount: workspaces.length,
      roomCount: rooms.length,
      assetCount: assets.length,
      assetVersionCount: assetVersions.length,
      commentCount: comments.length,
      collaboratorCount: collaborators.length
    },
    tickets: tickets.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      requesterEmail: ticket.requester_email,
      status: ticket.status,
      priority: ticket.priority,
      updatedAt: ticket.updated_at,
      createdAt: ticket.created_at
    }))
  };

  if (options.includeExport) {
    return {
      ...details,
      exportData: {
        generatedAt: new Date().toISOString(),
        organization,
        members: memberRows,
        workspaces,
        rooms,
        assets,
        assetVersions,
        comments,
        collaborators,
        tickets
      }
    };
  }

  return details;
}

async function handleCustomerDetail(req, res, context, orgId) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (!isUuid(orgId)) {
    sendJson(res, 400, { error: "Organization id is invalid." });
    return;
  }

  const includeExport = ["1", "true", "yes"].includes(normalizeQuery(queryValue(req, "export")));
  const payload = await loadCustomerDetail(context, orgId, { includeExport });

  if (includeExport) {
    await recordAuditEvent(context, {
      organizationId: orgId,
      action: "customer.export.json",
      targetType: "organization",
      targetId: orgId,
      metadata: {
        scope: "organization_full"
      }
    });
  }

  sendJson(res, 200, payload);
}

async function handleUsersList(req, res, context) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (req.method === "POST") {
    const body = (await getJsonBody(req)) ?? {};
    const email = parseEmail(body.email);
    const password = parsePassword(body.password);
    const displayName = nonEmpty(body.displayName) ?? nonEmpty(body.name) ?? null;
    const notify = parseBoolean(body.notify) === true;

    if (!email) {
      sendJson(res, 400, { error: "A valid email address is required." });
      return;
    }

    if (!displayName) {
      sendJson(res, 400, { error: "Display name is required." });
      return;
    }

    if (!password) {
      sendJson(res, 400, { error: "Password must be 8-256 characters." });
      return;
    }

    if (notify) {
      if (!canSendAdminEmail()) {
        sendJson(res, 400, {
          error: "Create and Notify is not configured. Set RESEND_API_KEY and ADMIN_EMAIL_FROM."
        });
        return;
      }

      if (!getAdminLoginUrl(req)) {
        sendJson(res, 400, {
          error: "Create and Notify is not configured. Set ADMIN_NOTIFY_LOGIN_URL."
        });
        return;
      }
    }

    const { data, error } = await context.adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName,
        name: displayName,
        display_name: displayName
      }
    });

    if (error) {
      const message = String(error.message ?? "").toLowerCase();
      const duplicateEmail =
        message.includes("already been registered") ||
        message.includes("already registered") ||
        message.includes("already exists") ||
        message.includes("duplicate");

      if (duplicateEmail) {
        sendJson(res, 409, { error: "A user with that email already exists." });
        return;
      }

      throw new HttpError(error.message || "Unable to create user.", 500);
    }

    const createdUser = data?.user ?? null;
    if (!createdUser) {
      throw new HttpError("Unable to create user.", 500);
    }

    let loginUrl = null;
    if (notify) {
      const delivery = await sendAdminUserCreatedEmail(req, {
        displayName,
        email,
        password,
        senderEmail: context.actor.email ?? null
      });
      loginUrl = delivery.loginUrl;
    }

    await recordAuditEvent(context, {
      organizationId: context.organizationId,
      action: "user.created",
      targetType: "user",
      targetId: createdUser.id,
      metadata: {
        userEmail: createdUser.email ?? email,
        displayName,
        notifyRequested: notify,
        notified: notify,
        loginUrl
      }
    });

    sendJson(res, 201, {
      ok: true,
      message: notify
        ? `User ${createdUser.email ?? email} created and notified.`
        : `User ${createdUser.email ?? email} created.`,
      notified: notify,
      loginUrl,
      user: {
        id: createdUser.id,
        email: createdUser.email ?? email,
        displayName: getUserDisplayName(createdUser),
        createdAt: createdUser.created_at ?? new Date().toISOString()
      }
    });
    return;
  }

  const q = normalizeQuery(queryValue(req, "q"));
  const limit = parsePageSize(req);
  const allUsers = await getAuthUsersCached(context);

  const filtered = allUsers.filter((user) => {
    if (!q) return true;
    const email = normalizeQuery(user.email);
    const name = normalizeQuery(getUserDisplayName(user));
    return (
      email.includes(q) ||
      name.includes(q) ||
      String(user.id).toLowerCase().includes(q)
    );
  });

  const selected = filtered.slice(0, limit);
  const userIds = selected.map((user) => user.id);
  const emails = selected
    .map((user) => normalizeQuery(user.email))
    .filter(Boolean);

  let memberships = [];
  if (userIds.length > 0) {
    const { data, error } = await context.adminClient
      .from("team_members")
      .select("organization_id, user_id, role, created_at")
      .in("user_id", userIds);

    if (error) throw new HttpError(error.message, 500);
    memberships = data ?? [];
  }

  const orgMap = await loadOrganizationsMap(
    context.adminClient,
    memberships.map((entry) => entry.organization_id)
  );

  let tickets = [];
  if (userIds.length > 0 || emails.length > 0) {
    const [byUserQuery, byEmailQuery] = await Promise.all([
      userIds.length > 0
        ? context.adminClient
            .from("support_tickets")
            .select("id, requester_user_id, requester_email, status, updated_at")
            .in("requester_user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
      emails.length > 0
        ? context.adminClient
            .from("support_tickets")
            .select("id, requester_user_id, requester_email, status, updated_at")
            .in("requester_email", emails)
            .is("requester_user_id", null)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (byUserQuery.error) throw new HttpError(byUserQuery.error.message, 500);
    if (byEmailQuery.error) throw new HttpError(byEmailQuery.error.message, 500);

    tickets = [...(byUserQuery.data ?? []), ...(byEmailQuery.data ?? [])];
  }

  let ownedWorkspaces = [];
  if (userIds.length > 0) {
    const { data, error } = await context.adminClient
      .from("workspaces")
      .select("owner_id, updated_at, created_at")
      .in("owner_id", userIds);

    if (error) throw new HttpError(error.message, 500);
    ownedWorkspaces = data ?? [];
  }

  const membershipsByUser = new Map();
  for (const membership of memberships) {
    const current = membershipsByUser.get(membership.user_id) ?? [];
    current.push({
      organizationId: membership.organization_id,
      organizationName: orgMap.get(membership.organization_id)?.name ?? null,
      role: membership.role,
      createdAt: membership.created_at
    });
    membershipsByUser.set(membership.user_id, current);
  }

  const ticketCountByUser = new Map();
  const ticketLastByUser = new Map();
  for (const ticket of tickets) {
    const ownerUserId = ticket.requester_user_id;
    if (ownerUserId) {
      ticketCountByUser.set(ownerUserId, (ticketCountByUser.get(ownerUserId) ?? 0) + 1);
      const previous = ticketLastByUser.get(ownerUserId) ?? null;
      ticketLastByUser.set(ownerUserId, maxIsoDate(previous, ticket.updated_at));
      continue;
    }

    const requesterEmail = normalizeQuery(ticket.requester_email);
    const user = selected.find((entry) => normalizeQuery(entry.email) === requesterEmail);
    if (!user) continue;

    ticketCountByUser.set(user.id, (ticketCountByUser.get(user.id) ?? 0) + 1);
    const previous = ticketLastByUser.get(user.id) ?? null;
    ticketLastByUser.set(user.id, maxIsoDate(previous, ticket.updated_at));
  }

  const workspaceLastByUser = new Map();
  for (const workspace of ownedWorkspaces) {
    const previous = workspaceLastByUser.get(workspace.owner_id) ?? null;
    workspaceLastByUser.set(
      workspace.owner_id,
      maxIsoDate(previous, workspace.updated_at ?? workspace.created_at)
    );
  }

  sendJson(res, 200, {
    users: selected.map((user) => {
      const membershipRows = membershipsByUser.get(user.id) ?? [];
      const suspendedUntil = nonEmpty(user.banned_until);
      const isSuspended = isFutureDate(suspendedUntil);
      return {
        id: user.id,
        email: user.email ?? null,
        displayName: getUserDisplayName(user),
        createdAt: user.created_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
        suspendedUntil,
        isSuspended,
        memberships: membershipRows,
        membershipCount: membershipRows.length,
        ticketCount: ticketCountByUser.get(user.id) ?? 0,
        recentActivityAt: maxIsoDate(
          user.last_sign_in_at ?? null,
          ticketLastByUser.get(user.id) ?? null,
          workspaceLastByUser.get(user.id) ?? null
        )
      };
    })
  });
}

async function handleUserDetail(req, res, context, userId) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (!isUuid(userId)) {
    sendJson(res, 400, { error: "User id is invalid." });
    return;
  }

  const users = await getAuthUsersCached(context);
  const user = users.find((entry) => entry.id === userId);
  if (!user) {
    sendJson(res, 404, { error: "User not found." });
    return;
  }

  const [membershipsQuery, ownedWorkspacesQuery, collabByUserQuery, collabByEmailQuery, ticketsByUserQuery, ticketsByEmailQuery] =
    await Promise.all([
      context.adminClient
        .from("team_members")
        .select("id, organization_id, user_id, role, display_name, created_at")
        .eq("user_id", userId),
      context.adminClient
        .from("workspaces")
        .select("id, name, description, owner_id, updated_at, created_at")
        .eq("owner_id", userId)
        .order("updated_at", { ascending: false }),
      context.adminClient
        .from("workspace_collaborators")
        .select("id, workspace_id, user_id, email, role, created_at")
        .eq("user_id", userId),
      user.email
        ? context.adminClient
            .from("workspace_collaborators")
            .select("id, workspace_id, user_id, email, role, created_at")
            .eq("email", normalizeQuery(user.email))
        : Promise.resolve({ data: [], error: null }),
      context.adminClient
        .from("support_tickets")
        .select("*")
        .eq("requester_user_id", userId)
        .order("updated_at", { ascending: false }),
      user.email
        ? context.adminClient
            .from("support_tickets")
            .select("*")
            .eq("requester_email", normalizeQuery(user.email))
            .is("requester_user_id", null)
            .order("updated_at", { ascending: false })
        : Promise.resolve({ data: [], error: null })
    ]);

  if (membershipsQuery.error) throw new HttpError(membershipsQuery.error.message, 500);
  if (ownedWorkspacesQuery.error) throw new HttpError(ownedWorkspacesQuery.error.message, 500);
  if (collabByUserQuery.error) throw new HttpError(collabByUserQuery.error.message, 500);
  if (collabByEmailQuery.error) throw new HttpError(collabByEmailQuery.error.message, 500);
  if (ticketsByUserQuery.error) throw new HttpError(ticketsByUserQuery.error.message, 500);
  if (ticketsByEmailQuery.error) throw new HttpError(ticketsByEmailQuery.error.message, 500);

  const memberships = membershipsQuery.data ?? [];
  const orgMap = await loadOrganizationsMap(
    context.adminClient,
    memberships.map((entry) => entry.organization_id)
  );

  const tickets = [
    ...(ticketsByUserQuery.data ?? []),
    ...(ticketsByEmailQuery.data ?? [])
  ];

  const collabRows = [
    ...(collabByUserQuery.data ?? []),
    ...(collabByEmailQuery.data ?? [])
  ];

  sendJson(res, 200, {
    user: {
      id: user.id,
      email: user.email ?? null,
      displayName: getUserDisplayName(user),
      createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
      suspendedUntil: nonEmpty(user.banned_until),
      isSuspended: isFutureDate(user.banned_until)
    },
    memberships: memberships.map((entry) => ({
      id: entry.id,
      organizationId: entry.organization_id,
      organizationName: orgMap.get(entry.organization_id)?.name ?? null,
      organizationSlug: orgMap.get(entry.organization_id)?.slug ?? null,
      role: entry.role,
      displayName: entry.display_name ?? null,
      createdAt: entry.created_at
    })),
    workspaces: {
      owned: (ownedWorkspacesQuery.data ?? []).map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        createdAt: workspace.created_at,
        updatedAt: workspace.updated_at
      })),
      collaborations: collabRows
    },
    tickets: tickets.map((ticket) => ({
      id: ticket.id,
      organizationId: ticket.organization_id,
      requesterEmail: ticket.requester_email,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      updatedAt: ticket.updated_at,
      createdAt: ticket.created_at
    })),
    recentActivityAt: maxIsoDate(
      user.last_sign_in_at ?? null,
      ...(ownedWorkspacesQuery.data ?? []).map((workspace) => workspace.updated_at ?? workspace.created_at),
      ...tickets.map((ticket) => ticket.updated_at ?? ticket.created_at)
    )
  });
}

async function handleUserSuspend(req, res, context, userId) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (!isUuid(userId)) {
    sendJson(res, 400, { error: "User id is invalid." });
    return;
  }

  if (userId === context.actor.id) {
    sendJson(res, 400, { error: "You cannot suspend your own account." });
    return;
  }

  const body = (await getJsonBody(req)) ?? {};
  const suspended = parseBoolean(body.suspended);
  if (suspended === null) {
    sendJson(res, 400, { error: "Suspended flag must be true or false." });
    return;
  }

  const { data: targetUserData, error: targetUserError } = await context.adminClient.auth.admin.getUserById(userId);
  if (targetUserError) {
    if (Number(targetUserError.status ?? 0) === 404) {
      sendJson(res, 404, { error: "User not found." });
      return;
    }
    throw new HttpError(targetUserError.message ?? "Unable to load user.", 500);
  }

  const targetUser = targetUserData?.user ?? null;
  if (!targetUser) {
    sendJson(res, 404, { error: "User not found." });
    return;
  }

  const { error: updateError } = await context.adminClient.auth.admin.updateUserById(userId, {
    ban_duration: suspended ? USER_SUSPEND_DURATION : "none"
  });

  if (updateError) {
    throw new HttpError("Unable to update user suspension.", 500);
  }

  await recordAuditEvent(context, {
    organizationId: context.organizationId,
    action: suspended ? "user.suspended" : "user.unsuspended",
    targetType: "user",
    targetId: userId,
    metadata: {
      userEmail: targetUser.email ?? null
    }
  });

  sendJson(res, 200, {
    ok: true,
    message: suspended ? "User suspended." : "User unsuspended."
  });
}

async function handleUserDelete(req, res, context, userId) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (!isUuid(userId)) {
    sendJson(res, 400, { error: "User id is invalid." });
    return;
  }

  if (userId === context.actor.id) {
    sendJson(res, 400, { error: "You cannot delete your own account." });
    return;
  }

  const { data: targetUserData, error: targetUserError } = await context.adminClient.auth.admin.getUserById(userId);
  if (targetUserError) {
    if (Number(targetUserError.status ?? 0) === 404) {
      sendJson(res, 404, { error: "User not found." });
      return;
    }
    throw new HttpError(targetUserError.message ?? "Unable to load user.", 500);
  }

  const targetUser = targetUserData?.user ?? null;
  if (!targetUser) {
    sendJson(res, 404, { error: "User not found." });
    return;
  }

  const { error: deleteError } = await context.adminClient.auth.admin.deleteUser(userId, true);
  if (deleteError && Number(deleteError.status ?? 0) !== 404) {
    throw new HttpError("Unable to delete user.", 500);
  }

  const [membershipCleanup, collaboratorCleanup] = await Promise.all([
    context.adminClient.from("team_members").delete().eq("user_id", userId),
    context.adminClient
      .from("workspace_collaborators")
      .update({ user_id: null })
      .eq("user_id", userId)
  ]);

  if (membershipCleanup.error) {
    throw new HttpError("User deleted, but team membership cleanup failed.", 500);
  }

  if (collaboratorCleanup.error) {
    throw new HttpError("User deleted, but collaborator cleanup failed.", 500);
  }

  await recordAuditEvent(context, {
    organizationId: context.organizationId,
    action: "user.deleted",
    targetType: "user",
    targetId: userId,
    metadata: {
      userEmail: targetUser.email ?? null
    }
  });

  sendJson(res, 200, {
    ok: true,
    message: "User deleted."
  });
}

async function handleUserResetPassword(req, res, context, userId) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (!isUuid(userId)) {
    sendJson(res, 400, { error: "User id is invalid." });
    return;
  }

  const { data: targetUserData, error: targetUserError } = await context.adminClient.auth.admin.getUserById(userId);
  if (targetUserError) {
    if (Number(targetUserError.status ?? 0) === 404) {
      sendJson(res, 404, { error: "User not found." });
      return;
    }
    throw new HttpError(targetUserError.message ?? "Unable to load user.", 500);
  }

  const targetUser = targetUserData?.user ?? null;
  const targetEmail = nonEmpty(targetUser?.email);
  if (!targetUser || !targetEmail) {
    sendJson(res, 400, { error: "Target user does not have an email login." });
    return;
  }

  const origin = getRequestOrigin(req);
  if (!origin) {
    throw new HttpError("Unable to resolve request origin.", 500);
  }

  const authClient = getSupabaseServerAuthClient();
  const { error } = await authClient.auth.resetPasswordForEmail(targetEmail, {
    redirectTo: `${origin}/reset-password`
  });

  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    const code = String(error.code ?? "");
    const status = Number(error.status ?? 0);
    const isRateLimited =
      status === 429 || code === "over_email_send_rate_limit" || message.includes("rate limit");

    if (isRateLimited) {
      throw new HttpError("Too many reset attempts. Please wait 60 minutes and try once.", 429);
    }

    throw new HttpError("Unable to send reset email at the moment.", 500);
  }

  await recordAuditEvent(context, {
    organizationId: context.organizationId,
    action: "user.password_reset_requested",
    targetType: "user",
    targetId: userId,
    metadata: {
      userEmail: targetEmail
    }
  });

  sendJson(res, 200, {
    ok: true,
    message: `Password reset email sent to ${targetEmail}.`
  });
}

async function handleAuditList(req, res, context) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const orgId = nonEmpty(queryValue(req, "orgId"));
  const action = nonEmpty(queryValue(req, "action"));
  const since = parseIsoDate(queryValue(req, "since"));
  const q = normalizeQuery(queryValue(req, "q"));
  const limit = parsePageSize(req);

  let query = context.adminClient
    .from("audit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (orgId) query = query.eq("organization_id", orgId);
  if (action) query = query.eq("action", action);
  if (since) query = query.gte("created_at", since);

  const { data, error } = await query;
  if (error) throw new HttpError(error.message, 500);

  let events = data ?? [];
  if (q) {
    events = events.filter((event) => {
      const haystack = [
        String(event.actor_email ?? "").toLowerCase(),
        String(event.action ?? "").toLowerCase(),
        String(event.target_type ?? "").toLowerCase(),
        String(event.target_id ?? "").toLowerCase(),
        JSON.stringify(event.metadata ?? {}).toLowerCase()
      ];
      return haystack.some((value) => value.includes(q));
    });
  }

  sendJson(res, 200, { events });
}

async function handleSystemHealth(req, res, context) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const env = {
    ADMIN_EMAILS: Boolean(nonEmpty(process.env.ADMIN_EMAILS)),
    SETTINGS_ENCRYPTION_KEY: Boolean(nonEmpty(process.env.SETTINGS_ENCRYPTION_KEY)),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(nonEmpty(process.env.SUPABASE_SERVICE_ROLE_KEY)),
    VITE_SUPABASE_URL: Boolean(nonEmpty(process.env.VITE_SUPABASE_URL)),
    VITE_SUPABASE_ANON_KEY: Boolean(nonEmpty(process.env.VITE_SUPABASE_ANON_KEY))
  };

  let supabaseConnected = false;
  let storageBucketConnected = false;
  let realtimeBasicCheck = false;
  let errors = [];

  try {
    const { error } = await context.adminClient
      .from("organizations")
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    supabaseConnected = true;
  } catch (error) {
    errors.push(`Supabase connectivity failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  try {
    const bucketResult = await context.adminClient.storage.getBucket("bandjoes-assets");
    if (bucketResult.error) throw bucketResult.error;
    storageBucketConnected = true;
  } catch (error) {
    errors.push(`Storage bucket check failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  try {
    const { error } = await context.adminClient.from("rooms").select("id", { head: true, count: "exact" });
    if (error) throw error;
    realtimeBasicCheck = true;
  } catch (error) {
    errors.push(`Realtime baseline query failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  sendJson(res, 200, {
    checkedAt: new Date().toISOString(),
    checks: {
      supabaseConnected,
      storageBucketConnected,
      realtimeBasicCheck
    },
    env,
    errors
  });
}

function resolveResource(req) {
  const explicit = nonEmpty(queryValue(req, "resource"));
  if (explicit) {
    return {
      resource: explicit,
      ticketId: nonEmpty(queryValue(req, "ticketId")),
      orgId: nonEmpty(queryValue(req, "orgId")),
      userId: nonEmpty(queryValue(req, "userId"))
    };
  }

  return parsePathInfo(req);
}

export default async function handler(req, res) {
  try {
    const { user: actor, organization } = await requireAdmin(req);
    const adminClient = getSupabaseAdminClient();
    const context = {
      actor,
      organizationId: organization.id,
      adminClient,
      authUsers: null,
      authUserMaps: null
    };

    const { resource, ticketId, orgId, userId } = resolveResource(req);

    if (resource === "support_tickets") {
      if (req.method === "GET") {
        await handleSupportTicketsList(req, res, context);
        return;
      }
      if (req.method === "POST") {
        await handleSupportTicketCreate(req, res, context);
        return;
      }
      res.setHeader("Allow", "GET, POST");
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    if (resource === "support_ticket") {
      await handleSupportTicketDetail(req, res, context, ticketId);
      return;
    }

    if (resource === "support_ticket_messages") {
      await handleSupportTicketMessage(req, res, context, ticketId);
      return;
    }

    if (resource === "support_ticket_notes") {
      await handleSupportTicketNote(req, res, context, ticketId);
      return;
    }

    if (resource === "support_ticket_update") {
      await handleSupportTicketUpdate(req, res, context, ticketId);
      return;
    }

    if (resource === "customers") {
      await handleCustomersList(req, res, context);
      return;
    }

    if (resource === "customer") {
      await handleCustomerDetail(req, res, context, orgId);
      return;
    }

    if (resource === "users") {
      await handleUsersList(req, res, context);
      return;
    }

    if (resource === "user") {
      await handleUserDetail(req, res, context, userId);
      return;
    }

    if (resource === "user_suspend") {
      await handleUserSuspend(req, res, context, userId);
      return;
    }

    if (resource === "user_delete") {
      await handleUserDelete(req, res, context, userId);
      return;
    }

    if (resource === "user_reset_password") {
      await handleUserResetPassword(req, res, context, userId);
      return;
    }

    if (resource === "audit") {
      await handleAuditList(req, res, context);
      return;
    }

    if (resource === "system_health") {
      await handleSystemHealth(req, res, context);
      return;
    }

    sendJson(res, 404, { error: "Admin console endpoint not found." });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }

    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error."
    });
  }
}
