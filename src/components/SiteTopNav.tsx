import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, LogOut, UserCircle2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

function isAuthenticatedUser(user: { is_anonymous?: boolean } | null | undefined) {
  return Boolean(user && !user.is_anonymous);
}

function parseAvatarUrl(user: User | null | undefined) {
  if (!user?.user_metadata || typeof user.user_metadata !== "object") return null;
  const avatar = (user.user_metadata as Record<string, unknown>).avatar_url;
  if (typeof avatar !== "string" || avatar.trim().length === 0) return null;
  return avatar.trim();
}

function resolveInitial(user: User | null | undefined) {
  if (!user) return "U";

  const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const name =
    (typeof (metadata as Record<string, unknown>).full_name === "string"
      ? ((metadata as Record<string, unknown>).full_name as string)
      : null) ??
    (typeof (metadata as Record<string, unknown>).name === "string"
      ? ((metadata as Record<string, unknown>).name as string)
      : null) ??
    user.email?.split("@")[0] ??
    "";

  return name.trim().charAt(0).toUpperCase() || "U";
}

function resolveDisplayName(user: User | null | undefined) {
  if (!user) return "User";

  const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const name =
    (typeof (metadata as Record<string, unknown>).full_name === "string"
      ? ((metadata as Record<string, unknown>).full_name as string)
      : null) ??
    (typeof (metadata as Record<string, unknown>).name === "string"
      ? ((metadata as Record<string, unknown>).name as string)
      : null) ??
    user.email?.split("@")[0] ??
    "User";

  return name.trim() || "User";
}

export function SiteTopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarInitial, setAvatarInitial] = useState("U");
  const [displayName, setDisplayName] = useState("User");

  useEffect(() => {
    let active = true;

    async function hydrate() {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!active) return;
      const loggedIn = isAuthenticatedUser(session?.user);
      setIsLoggedIn(loggedIn);
      setAvatarUrl(loggedIn ? parseAvatarUrl(session?.user) : null);
      setAvatarInitial(loggedIn ? resolveInitial(session?.user) : "U");
      setDisplayName(loggedIn ? resolveDisplayName(session?.user) : "User");
    }

    void hydrate();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const loggedIn = isAuthenticatedUser(session?.user);
      setIsLoggedIn(loggedIn);
      setAvatarUrl(loggedIn ? parseAvatarUrl(session?.user) : null);
      setAvatarInitial(loggedIn ? resolveInitial(session?.user) : "U");
      setDisplayName(loggedIn ? resolveDisplayName(session?.user) : "User");
      if (!loggedIn) {
        setMenuOpen(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setMenuOpen(false);
    navigate("/", { replace: true });
  }

  const showHomeAnchors = location.pathname === "/";

  return (
    <header className="border-b border-[var(--border)] bg-[var(--background)]/95">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link className="text-lg font-medium text-[var(--foreground)]" to="/">
          MagisterLudi
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          {showHomeAnchors ? (
            <>
              <a
                className="text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                href="#features"
              >
                Features
              </a>
              <a
                className="text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                href="#about"
              >
                About
              </a>
            </>
          ) : null}

          {isLoggedIn ? (
            <>
              <Link
                className="text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                to="/room/hard-hat-system"
              >
                Workspace
              </Link>

              <div className="relative" ref={menuRef}>
                <button
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-1.5 py-1 text-[var(--muted-foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                  onClick={() => setMenuOpen((current) => !current)}
                  type="button"
                >
                  {avatarUrl ? (
                    <img alt={displayName} className="h-7 w-7 rounded-full object-cover" src={avatarUrl} />
                  ) : (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-medium text-[var(--foreground)]">
                      {avatarInitial}
                    </span>
                  )}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>

                {menuOpen ? (
                  <div
                    className="absolute right-0 top-full z-20 mt-2 w-52 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-sm"
                    role="menu"
                  >
                    <div className="mb-1 rounded-md px-2 py-1.5 text-xs text-[var(--muted-foreground)]">
                      {displayName}
                    </div>
                    <Link
                      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--accent)]"
                      onClick={() => setMenuOpen(false)}
                      role="menuitem"
                      to="/settings/profile"
                    >
                      <UserCircle2 className="h-4 w-4" />
                      Profile
                    </Link>
                    <button
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--accent)]"
                      onClick={handleSignOut}
                      role="menuitem"
                      type="button"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <Link className="text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]" to="/login">
                Login
              </Link>
              <Link
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                to="/signup"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
