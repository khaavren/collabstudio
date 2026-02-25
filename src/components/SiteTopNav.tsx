import { useEffect, useState } from "react";
import { ArrowRight, LogOut } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

function isAuthenticatedUser(user: { is_anonymous?: boolean } | null | undefined) {
  return Boolean(user && !user.is_anonymous);
}

export function SiteTopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!active) return;
      setIsLoggedIn(isAuthenticatedUser(session?.user));
    }

    void hydrate();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setIsLoggedIn(isAuthenticatedUser(session?.user));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
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
                to="/settings/profile"
              >
                Profile
              </Link>
              <Link
                className="text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                to="/room/hard-hat-system"
              >
                Workspace
              </Link>
              <button
                className="inline-flex items-center gap-1 text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                onClick={handleSignOut}
                type="button"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
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
