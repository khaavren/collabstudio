import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BookOpenText,
  Building2,
  LifeBuoy,
  LogOut,
  Search,
  Server,
  ShieldCheck,
  Users
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "@/app/context/auth-context";
import { getAdminIdentity, listCustomers, listSupportTickets, listUsers, type CustomerSummary, type SupportTicketSummary, type UserSummary } from "@/lib/adminApi";

type AdminIdentity = {
  organizationId: string;
  role: string;
  email: string | null;
  userId: string;
};

export type AdminOutletContext = {
  identity: AdminIdentity;
  refreshKey: number;
};

function menuLinkClass(active: boolean) {
  return `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
    active ? "bg-white/10 text-white" : "text-[#d9e0eb] hover:bg-white/10 hover:text-white"
  }`;
}

export function useAdminContext() {
  return useOutletContext<AdminOutletContext>();
}

export function AdminConsoleLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, login, logout, user } = useAuth();

  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [ticketResults, setTicketResults] = useState<SupportTicketSummary[]>([]);
  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([]);
  const [userResults, setUserResults] = useState<UserSummary[]>([]);

  useEffect(() => {
    let active = true;

    async function verifyAccess() {
      if (!isAuthenticated || !user?.id) {
        if (!active) return;
        setIdentity(null);
        setIsCheckingAccess(false);
        return;
      }

      setIsCheckingAccess(true);
      setAccessError(null);

      try {
        const payload = await getAdminIdentity();
        if (!active) return;
        setIdentity({
          organizationId: payload.organizationId,
          role: payload.role,
          email: payload.email,
          userId: payload.userId
        });
      } catch (error) {
        if (!active) return;
        setIdentity(null);
        setAccessError(error instanceof Error ? error.message : "Unable to verify admin access.");
      } finally {
        if (!active) return;
        setIsCheckingAccess(false);
      }
    }

    void verifyAccess();

    return () => {
      active = false;
    };
  }, [isAuthenticated, user?.id, refreshKey]);

  useEffect(() => {
    let active = true;
    const searchText = searchQuery.trim();

    if (!identity || searchText.length < 2) {
      setTicketResults([]);
      setCustomerResults([]);
      setUserResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const [tickets, customers, usersList] = await Promise.all([
            listSupportTickets({ q: searchText, limit: 5 }),
            listCustomers({ q: searchText, limit: 5 }),
            listUsers({ q: searchText, limit: 5 })
          ]);

          if (!active) return;
          setTicketResults(tickets);
          setCustomerResults(customers);
          setUserResults(usersList);
        } catch {
          if (!active) return;
          setTicketResults([]);
          setCustomerResults([]);
          setUserResults([]);
        } finally {
          if (!active) return;
          setSearchLoading(false);
        }
      })();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [identity, searchQuery]);

  useEffect(() => {
    setSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }

    window.addEventListener("mousedown", handleOutsideClick);
    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSigningIn(true);
    setAccessError(null);

    try {
      await login(loginEmail, loginPassword);
      setLoginPassword("");
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsSigningIn(false);
    }
  }

  const searchHasResults =
    searchLoading || ticketResults.length > 0 || customerResults.length > 0 || userResults.length > 0;

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef1f5] p-6">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-[var(--border)] bg-white p-6">
          <h1 className="text-2xl font-semibold text-[#243042]">Admin Sign In</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Use your support/admin account to access the admin console.</p>
          {accessError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{accessError}</div>
          ) : null}
          <form className="space-y-3" onSubmit={handleSignIn}>
            <input
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              disabled={isSigningIn}
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="admin@company.com"
              type="email"
              value={loginEmail}
            />
            <input
              className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              disabled={isSigningIn}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder="Password"
              type="password"
              value={loginPassword}
            />
            <button
              className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={isSigningIn}
              type="submit"
            >
              {isSigningIn ? "Signing in..." : "Sign In"}
            </button>
          </form>
          <Link className="text-sm text-[var(--muted-foreground)] hover:underline" to="/">
            Back to workspace
          </Link>
        </div>
      </main>
    );
  }

  if (isCheckingAccess) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef1f5] p-6">
        <div className="rounded-md border border-[var(--border)] bg-white px-5 py-3 text-sm text-[var(--muted-foreground)]">
          Loading admin console...
        </div>
      </main>
    );
  }

  if (!identity) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef1f5] p-6">
        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-white px-6 py-5 text-sm text-[var(--foreground)]">
          <p>{accessError ?? "Not authorized for admin console."}</p>
          <div className="flex items-center gap-3">
            <button className="text-[var(--muted-foreground)] hover:underline" onClick={() => void logout()} type="button">
              Sign out
            </button>
            <Link className="text-[var(--muted-foreground)] hover:underline" to="/">
              Back to workspace
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const outletContext: AdminOutletContext = {
    identity,
    refreshKey
  };

  return (
    <main className="min-h-screen bg-[#eef1f5] text-[var(--foreground)]">
      <div className="flex min-h-screen">
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-white/15 bg-gradient-to-b from-[#313c50] to-[#2a3345] text-[#d9e0eb]">
          <div className="flex items-center gap-3 border-b border-white/15 px-6 py-5">
            <div className="rounded-md bg-white/10 p-2">
              <BookOpenText className="h-5 w-5" />
            </div>
            <p className="text-xl font-semibold tracking-tight">Admin Console</p>
          </div>

          <nav className="space-y-1 px-4 py-4">
            <NavLink className={({ isActive }) => menuLinkClass(isActive)} end to="/admin">
              <Activity className="h-4 w-4" />
              Dashboard
            </NavLink>
            <NavLink className={({ isActive }) => menuLinkClass(isActive)} to="/admin/support">
              <LifeBuoy className="h-4 w-4" />
              Support Inbox
            </NavLink>
            <NavLink className={({ isActive }) => menuLinkClass(isActive)} to="/admin/customers">
              <Building2 className="h-4 w-4" />
              Customers
            </NavLink>
            <NavLink className={({ isActive }) => menuLinkClass(isActive)} to="/admin/users">
              <Users className="h-4 w-4" />
              Users
            </NavLink>
            <NavLink className={({ isActive }) => menuLinkClass(isActive)} to="/admin/audit">
              <ShieldCheck className="h-4 w-4" />
              Audit Log
            </NavLink>
            <NavLink className={({ isActive }) => menuLinkClass(isActive)} to="/admin/system">
              <Server className="h-4 w-4" />
              System Health
            </NavLink>
          </nav>

          <div className="mt-auto border-t border-white/15 px-6 py-5 text-sm">
            <p className="truncate">{identity.email ?? "Unknown admin"}</p>
            <p className="mt-0.5 text-xs uppercase tracking-wide text-white/70">Role: {identity.role}</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-300/60 bg-white px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full max-w-xl" ref={menuRef}>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm"
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onFocus={() => setSearchOpen(true)}
                    placeholder="Search tickets, customers, users"
                    value={searchQuery}
                  />
                </div>

                {searchOpen && searchQuery.trim().length >= 2 ? (
                  <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[420px] overflow-y-auto rounded-md border border-slate-300 bg-white p-3 shadow-lg">
                    {searchLoading ? (
                      <p className="text-sm text-slate-500">Searching...</p>
                    ) : !searchHasResults ? (
                      <p className="text-sm text-slate-500">No matching admin records.</p>
                    ) : (
                      <div className="space-y-3">
                        {ticketResults.length > 0 ? (
                          <section>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Tickets</p>
                            <div className="space-y-1">
                              {ticketResults.map((ticket) => (
                                <button
                                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 transition hover:bg-slate-100"
                                  key={ticket.id}
                                  onClick={() => {
                                    setSearchOpen(false);
                                    navigate(`/admin/support/tickets/${ticket.id}`);
                                  }}
                                  type="button"
                                >
                                  #{ticket.id.slice(0, 8)} · {ticket.subject}
                                </button>
                              ))}
                            </div>
                          </section>
                        ) : null}
                        {customerResults.length > 0 ? (
                          <section>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Customers</p>
                            <div className="space-y-1">
                              {customerResults.map((customer) => (
                                <button
                                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 transition hover:bg-slate-100"
                                  key={customer.id}
                                  onClick={() => {
                                    setSearchOpen(false);
                                    navigate(`/admin/customers/${customer.id}`);
                                  }}
                                  type="button"
                                >
                                  {customer.name} ({customer.slug})
                                </button>
                              ))}
                            </div>
                          </section>
                        ) : null}
                        {userResults.length > 0 ? (
                          <section>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Users</p>
                            <div className="space-y-1">
                              {userResults.map((member) => (
                                <button
                                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 transition hover:bg-slate-100"
                                  key={member.id}
                                  onClick={() => {
                                    setSearchOpen(false);
                                    navigate(`/admin/users/${member.id}`);
                                  }}
                                  type="button"
                                >
                                  {member.displayName} · {member.email ?? "No email"}
                                </button>
                              ))}
                            </div>
                          </section>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                <Link className="inline-flex items-center gap-2 text-sm text-slate-600 transition hover:text-slate-900" to="/">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Workspace
                </Link>
                <button
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
                  onClick={() => void logout()}
                  type="button"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
            {accessError ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {accessError}
              </div>
            ) : null}
          </header>

          <div className="flex-1 overflow-y-auto p-5">
            <Outlet context={outletContext} />
          </div>
        </div>
      </div>
    </main>
  );
}
