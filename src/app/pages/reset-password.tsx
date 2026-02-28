import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { SiteTopNav } from "@/components/SiteTopNav";

function parseHashParams() {
  const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(raw);
}

function parseRecoveryType(rawType: string | null) {
  const normalized = String(rawType ?? "").trim().toLowerCase();
  return normalized === "recovery" ? "recovery" : null;
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPreparing, setIsPreparing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return isReady && !isSubmitting && newPassword.trim().length >= 8 && confirmPassword.trim().length >= 8;
  }, [confirmPassword, isReady, isSubmitting, newPassword]);

  useEffect(() => {
    let active = true;

    async function initializeRecoverySession() {
      if (!isSupabaseConfigured) {
        if (!active) return;
        setError("Supabase is not configured.");
        setIsPreparing(false);
        return;
      }

      try {
        const hashParams = parseHashParams();
        const queryParams = new URLSearchParams(window.location.search);

        const hashError = hashParams.get("error_description") ?? hashParams.get("error");
        const queryError = queryParams.get("error_description") ?? queryParams.get("error");
        if (hashError || queryError) {
          throw new Error("Reset link is invalid or expired. Request a new reset link.");
        }

        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const recoveryType = parseRecoveryType(hashParams.get("type") ?? queryParams.get("type"));
        const code = queryParams.get("code");
        const tokenHash = queryParams.get("token_hash");

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw new Error("Reset link is invalid or expired. Request a new reset link.");
          }
        } else if (tokenHash && recoveryType === "recovery") {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: tokenHash
          });

          if (verifyError) {
            throw new Error("Reset link is invalid or expired. Request a new reset link.");
          }
        } else if (accessToken && refreshToken && recoveryType === "recovery") {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          if (setSessionError) {
            throw new Error("Reset link is invalid or expired. Request a new reset link.");
          }
        }

        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session?.access_token || !session.user) {
          throw new Error("Reset link is invalid or expired. Request a new reset link.");
        }

        window.history.replaceState({}, "", "/reset-password");

        if (!active) return;
        setIsReady(true);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Unable to start password reset.");
      } finally {
        if (!active) return;
        setIsPreparing(false);
      }
    }

    void initializeRecoverySession();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const nextPassword = newPassword.trim();
    const nextConfirm = confirmPassword.trim();

    if (!nextPassword || !nextConfirm) {
      setError("Enter and confirm your new password.");
      return;
    }

    if (nextPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    if (nextPassword !== nextConfirm) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: nextPassword
      });

      if (updateError) {
        throw new Error(updateError.message || "Unable to update password.");
      }

      setSuccess("Password updated. Redirecting to login...");
      setNewPassword("");
      setConfirmPassword("");
      await supabase.auth.signOut({ scope: "local" });
      navigate("/login?reset=success", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <SiteTopNav />
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">Set New Password</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Choose a new password for your account.
          </p>

          {isPreparing ? (
            <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--accent)] px-3 py-2 text-sm text-[var(--muted-foreground)]">
              Preparing secure reset session...
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}

          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none"
              disabled={!isReady || isSubmitting}
              minLength={8}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
              type="password"
              value={newPassword}
            />
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none"
              disabled={!isReady || isSubmitting}
              minLength={8}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm new password"
              type="password"
              value={confirmPassword}
            />
            <button
              className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              disabled={!canSubmit}
              type="submit"
            >
              {isSubmitting ? "Updating..." : "Update password"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-[var(--muted-foreground)]">
            <Link className="font-medium text-[var(--foreground)] hover:underline" to="/login">
              Back to login
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
