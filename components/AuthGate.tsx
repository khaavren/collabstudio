"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getPublicSupabaseEnv } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthGateProps = {
  children: (context: {
    user: User;
    signOut: () => Promise<void>;
  }) => React.ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const env = useMemo(() => getPublicSupabaseEnv(), []);
  const supabase = useMemo(
    () => (env.isConfigured ? getSupabaseBrowserClient() : null),
    [env.isConfigured]
  );
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (isMounted) {
        setUser(data.user ?? null);
        setIsLoading(false);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleMagicLinkSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setMessage(null);
    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: typeof window === "undefined" ? undefined : window.location.origin
      }
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Magic link sent. Check your email to continue.");
    }

    setIsSubmitting(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  if (!env.isConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-stone-300 bg-white p-8 shadow-lg shadow-stone-200/60">
          <h1 className="text-2xl font-semibold text-stone-900">Band Joes Studio</h1>
          <p className="mt-3 text-sm text-stone-600">
            Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to start the app.
          </p>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-xl border border-stone-300 bg-white px-6 py-4 text-sm text-stone-600 shadow-sm">
          Loading Band Joes Studio...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-stone-300 bg-white p-8 shadow-lg shadow-stone-200/60">
          <h1 className="text-2xl font-semibold text-stone-900">Band Joes Studio</h1>
          <p className="mt-2 text-sm text-stone-600">
            Sign in with an email magic link to collaborate in realtime.
          </p>

          <form className="mt-6 space-y-3" onSubmit={handleMagicLinkSignIn}>
            <label className="block text-sm font-medium text-stone-700" htmlFor="email">
              Work email
            </label>
            <input
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none transition focus:border-stone-500"
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
              type="email"
              value={email}
            />
            <button
              className="w-full rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Sending magic link..." : "Send magic link"}
            </button>
          </form>

          {message ? <p className="mt-4 text-sm text-stone-600">{message}</p> : null}
        </div>
      </main>
    );
  }

  return <>{children({ user, signOut })}</>;
}
