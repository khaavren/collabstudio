import { FormEvent, useEffect, useState } from "react";
import {
  Link,
  RouterProvider,
  createBrowserRouter,
  type LoaderFunctionArgs,
  useNavigate
} from "react-router-dom";
import { HomePage } from "@/app/pages/home";
import { SiteTopNav } from "@/components/SiteTopNav";
import { ensureAnonSession, supabase } from "@/lib/supabase";
import { AdminPage } from "@/pages/AdminPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { RoomPage } from "@/pages/RoomPage";

function roomLoader({ params }: LoaderFunctionArgs) {
  return {
    roomSlug: params.roomId ?? "hard-hat-system"
  };
}

function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <SiteTopNav />
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">Get Started with MagisterLudi</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            Enter the collaborative workspace and start building with your existing AI platform.
          </p>
          <Link
            className="mt-5 inline-flex rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            to="/room/hard-hat-system"
          >
            Open Workspace
          </Link>
        </div>
      </main>
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function hydrateSession() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!active) return;
      if (session?.user && !session.user.is_anonymous) {
        navigate("/room/hard-hat-system", { replace: true });
      }
    }

    void hydrateSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user && !session.user.is_anonymous) {
        navigate("/room/hard-hat-system", { replace: true });
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  async function handleSendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Email is required.");
      return;
    }

    setIsSending(true);

    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (session?.user?.is_anonymous) {
        await supabase.auth.signOut();
      }

      const redirectTo = `${window.location.origin}/room/hard-hat-system`;
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: redirectTo
        }
      });

      if (signInError) {
        setError(signInError.message);
        setIsSending(false);
        return;
      }

      setMessage("Magic link sent. Check your email to continue to the workspace.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send magic link.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleContinueAsGuest() {
    setError(null);
    setMessage(null);
    setIsGuestLoading(true);

    try {
      await ensureAnonSession();
      navigate("/room/hard-hat-system");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start guest session.");
    } finally {
      setIsGuestLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <SiteTopNav />
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">Login</h1>

          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            Sign in to your workspace with email magic link.
          </p>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}

          <form className="mt-4 space-y-3" onSubmit={handleSendMagicLink}>
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              type="email"
              value={email}
            />
            <button
              className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              disabled={isSending}
              type="submit"
            >
              {isSending ? "Sending..." : "Send Magic Link"}
            </button>
          </form>

          <button
            className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--accent)] disabled:opacity-60"
            disabled={isGuestLoading}
            onClick={handleContinueAsGuest}
            type="button"
          >
            {isGuestLoading ? "Starting..." : "Continue as Guest"}
          </button>

          <div className="mt-4 border-t border-[var(--border)] pt-4 text-center text-sm text-[var(--muted-foreground)]">
            Admin access?{" "}
            <Link className="font-medium text-[var(--foreground)] hover:underline" to="/admin">
              Go to Admin Sign In
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--background)] text-[var(--muted-foreground)]">
      Page not found.
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />
  },
  {
    path: "/signup",
    element: <SignupPage />
  },
  {
    path: "/login",
    element: <LoginPage />
  },
  {
    path: "/room/:roomId",
    loader: roomLoader,
    element: <RoomPage />
  },
  {
    path: "/admin",
    element: <AdminPage />
  },
  {
    path: "/settings/profile",
    element: <ProfilePage />
  },
  {
    path: "*",
    element: <NotFoundPage />
  }
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
