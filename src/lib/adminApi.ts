import { fetchWithAuth } from "@/lib/admin";

export type TicketStatus = "open" | "pending" | "solved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export type SupportTicketSummary = {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  requesterEmail: string;
  requesterUserId: string | null;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string | null;
  assigneeUserId: string | null;
  assigneeEmail: string | null;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupportTicketDetail = {
  ticket: {
    id: string;
    organizationId: string | null;
    organizationName: string | null;
    requesterEmail: string;
    requesterUserId: string | null;
    requesterName: string | null;
    subject: string;
    status: TicketStatus;
    priority: TicketPriority;
    category: string | null;
    assigneeUserId: string | null;
    assigneeName: string | null;
    assigneeEmail: string | null;
    createdAt: string;
    updatedAt: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    contact_email: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  organizationMembers: Array<{
    id: string;
    organizationId: string;
    userId: string;
    role: string;
    displayName: string | null;
    email: string | null;
    createdAt: string;
  }>;
  messages: Array<{
    id: string;
    ticketId: string;
    authorType: "customer" | "admin";
    authorUserId: string | null;
    authorName: string;
    authorEmail: string | null;
    body: string;
    attachments: unknown[];
    createdAt: string;
  }>;
  internalNotes: Array<{
    id: string;
    ticketId: string;
    adminUserId: string;
    adminName: string;
    adminEmail: string | null;
    body: string;
    createdAt: string;
  }>;
};

export type CustomerSummary = {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  memberCount: number;
  workspaceCount: number;
  openTicketCount: number;
  modelConfigured: boolean;
  updatedAt: string;
  lastActivityAt: string | null;
};

export type CustomerDetail = {
  organization: {
    id: string;
    name: string;
    slug: string;
    website: string | null;
    contact_email: string | null;
    phone: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
    created_at: string;
    updated_at: string;
  };
  members: Array<{
    id: string;
    userId: string;
    role: string;
    displayName: string | null;
    email: string | null;
    createdAt: string;
  }>;
  diagnostics: {
    modelApiConfigured: boolean;
    modelProvider: string | null;
    model: string | null;
    lastGenerationAttemptAt: string | null;
    approxStorageMb: number;
    recentActivityAt: string | null;
    workspaceCount: number;
    roomCount: number;
    assetCount: number;
    assetVersionCount: number;
    commentCount: number;
    collaboratorCount: number;
  };
  tickets: Array<{
    id: string;
    subject: string;
    requesterEmail: string;
    status: TicketStatus;
    priority: TicketPriority;
    updatedAt: string;
    createdAt: string;
  }>;
  exportData?: Record<string, unknown>;
};

export type UserSummary = {
  id: string;
  email: string | null;
  displayName: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  suspendedUntil: string | null;
  isSuspended: boolean;
  memberships: Array<{
    organizationId: string;
    organizationName: string | null;
    role: string;
    createdAt: string;
  }>;
  membershipCount: number;
  ticketCount: number;
  recentActivityAt: string | null;
};

export type UserDetail = {
  user: {
    id: string;
    email: string | null;
    displayName: string;
    createdAt: string | null;
    lastSignInAt: string | null;
    suspendedUntil: string | null;
    isSuspended: boolean;
  };
  memberships: Array<{
    id: string;
    organizationId: string;
    organizationName: string | null;
    organizationSlug: string | null;
    role: string;
    displayName: string | null;
    createdAt: string;
  }>;
  workspaces: {
    owned: Array<{
      id: string;
      name: string;
      description: string;
      createdAt: string;
      updatedAt: string;
    }>;
    collaborations: Array<{
      id: string;
      workspace_id: string;
      user_id: string | null;
      email: string;
      role: string;
      created_at: string;
    }>;
  };
  tickets: Array<{
    id: string;
    organizationId: string | null;
    requesterEmail: string;
    subject: string;
    status: TicketStatus;
    priority: TicketPriority;
    updatedAt: string;
    createdAt: string;
  }>;
  recentActivityAt: string | null;
};

export type AuditEvent = {
  id: string;
  organization_id: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SystemHealth = {
  checkedAt: string;
  checks: {
    supabaseConnected: boolean;
    storageBucketConnected: boolean;
    realtimeBasicCheck: boolean;
  };
  env: {
    ADMIN_EMAILS: boolean;
    SETTINGS_ENCRYPTION_KEY: boolean;
    SUPABASE_SERVICE_ROLE_KEY: boolean;
    VITE_SUPABASE_URL: boolean;
    VITE_SUPABASE_ANON_KEY: boolean;
  };
  errors: string[];
};

function toUserError(responseBody: unknown, fallback: string) {
  if (responseBody && typeof responseBody === "object" && "error" in responseBody) {
    const message = String((responseBody as { error?: string }).error ?? "").trim();
    if (message) return message;
  }
  return fallback;
}

async function requestJson<T>(input: string, init?: RequestInit, fallbackError = "Request failed.") {
  let response: Response;
  try {
    response = await fetchWithAuth(input, init);
  } catch (error) {
    if (error instanceof Error && error.message.trim()) {
      throw new Error(error.message);
    }
    throw new Error("Network error: unable to reach admin API.");
  }

  if (response.status === 401) {
    response = await fetchWithAuth(input, init, { forceRefresh: true });
  }

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(toUserError(payload, fallbackError));
  }

  return payload;
}

function withParams(path: string, params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    search.set(key, String(value));
  });

  const serialized = search.toString();
  return serialized.length > 0 ? `${path}?${serialized}` : path;
}

export async function getAdminIdentity() {
  return requestJson<{ authorized: boolean; organizationId: string; role: string; email: string | null; userId: string }>(
    "/api/admin/me",
    { method: "GET" },
    "Unable to verify admin session."
  );
}

export async function listSupportTickets(params: {
  status?: TicketStatus | "";
  priority?: TicketPriority | "";
  q?: string;
  orgId?: string;
  limit?: number;
}) {
  const payload = await requestJson<{ tickets: SupportTicketSummary[] }>(
    withParams("/api/admin/support/tickets", {
      status: params.status,
      priority: params.priority,
      q: params.q,
      orgId: params.orgId,
      limit: params.limit
    }),
    { method: "GET" },
    "Unable to load support tickets."
  );

  return payload.tickets ?? [];
}

export async function createSupportTicket(input: {
  subject: string;
  requesterEmail: string;
  requesterUserId?: string | null;
  organizationId?: string | null;
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: string | null;
}) {
  const payload = await requestJson<{ ticket: SupportTicketSummary }>(
    "/api/admin/support/tickets",
    {
      method: "POST",
      body: JSON.stringify(input)
    },
    "Unable to create support ticket."
  );

  return payload.ticket;
}

export async function getSupportTicket(ticketId: string) {
  return requestJson<SupportTicketDetail>(
    `/api/admin/support/tickets/${ticketId}`,
    { method: "GET" },
    "Unable to load support ticket."
  );
}

export async function postSupportTicketMessage(ticketId: string, body: { body: string; attachments?: unknown[] }) {
  return requestJson<{ message: unknown }>(
    `/api/admin/support/tickets/${ticketId}/messages`,
    {
      method: "POST",
      body: JSON.stringify(body)
    },
    "Unable to send admin message."
  );
}

export async function postSupportTicketNote(ticketId: string, body: { body: string }) {
  return requestJson<{ note: unknown }>(
    `/api/admin/support/tickets/${ticketId}/notes`,
    {
      method: "POST",
      body: JSON.stringify(body)
    },
    "Unable to add internal note."
  );
}

export async function updateSupportTicket(
  ticketId: string,
  updates: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assigneeUserId?: string | null;
    category?: string | null;
    subject?: string;
  }
) {
  const payload = await requestJson<{ ticket: SupportTicketSummary }>(
    `/api/admin/support/tickets/${ticketId}/update`,
    {
      method: "POST",
      body: JSON.stringify(updates)
    },
    "Unable to update support ticket."
  );

  return payload.ticket;
}

export async function listCustomers(params: { q?: string; limit?: number }) {
  const payload = await requestJson<{ customers: CustomerSummary[] }>(
    withParams("/api/admin/customers", {
      q: params.q,
      limit: params.limit
    }),
    { method: "GET" },
    "Unable to load customers."
  );

  return payload.customers ?? [];
}

export async function getCustomer(orgId: string, options?: { export?: boolean }) {
  return requestJson<CustomerDetail>(
    withParams(`/api/admin/customers/${orgId}`, {
      export: options?.export ? 1 : undefined
    }),
    { method: "GET" },
    "Unable to load customer diagnostics."
  );
}

export async function listUsers(params: { q?: string; limit?: number }) {
  const payload = await requestJson<{ users: UserSummary[] }>(
    withParams("/api/admin/users", {
      q: params.q,
      limit: params.limit
    }),
    { method: "GET" },
    "Unable to load users."
  );

  return payload.users ?? [];
}

export async function getUserDetail(userId: string) {
  return requestJson<UserDetail>(
    `/api/admin/users/${userId}`,
    { method: "GET" },
    "Unable to load user diagnostics."
  );
}

export async function setUserSuspended(userId: string, suspended: boolean) {
  return requestJson<{ ok: boolean; message: string }>(
    `/api/admin/users/${userId}/suspend`,
    {
      method: "POST",
      body: JSON.stringify({ suspended })
    },
    "Unable to update user suspension."
  );
}

export async function deleteUserAccount(userId: string) {
  return requestJson<{ ok: boolean; message: string }>(
    `/api/admin/users/${userId}/delete`,
    {
      method: "POST"
    },
    "Unable to delete user."
  );
}

export async function listAuditEvents(params: {
  q?: string;
  orgId?: string;
  action?: string;
  since?: string;
  limit?: number;
}) {
  const payload = await requestJson<{ events: AuditEvent[] }>(
    withParams("/api/admin/audit", {
      q: params.q,
      orgId: params.orgId,
      action: params.action,
      since: params.since,
      limit: params.limit
    }),
    { method: "GET" },
    "Unable to load audit events."
  );

  return payload.events ?? [];
}

export async function getSystemHealth() {
  return requestJson<SystemHealth>(
    "/api/admin/system/health",
    { method: "GET" },
    "Unable to load system health."
  );
}
