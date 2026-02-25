import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/context/auth-context";
import { SiteTopNav } from "@/components/SiteTopNav";

export function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <SiteTopNav />
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">Log In</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Continue to your MagisterLudi dashboard.
          </p>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              type="email"
              value={email}
            />
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              type="password"
              value={password}
            />
            <button
              className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Signing in..." : "Log In"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-[var(--muted-foreground)]">
            Need an account?{" "}
            <Link className="font-medium text-[var(--foreground)] hover:underline" to="/signup">
              Sign up
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
