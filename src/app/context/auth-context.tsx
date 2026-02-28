import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatarUrl?: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (next: Partial<AuthUser>) => Promise<void>;
  changePassword: (nextPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const MAX_AVATAR_URL_LENGTH = 2048;

function toInitials(name: string, email: string) {
  const fromName = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  if (fromName) return fromName;
  const fallback = email.trim().charAt(0).toUpperCase();
  return fallback || "U";
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function mapSupabaseUser(user: User): AuthUser {
  const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const inferredName =
    firstNonEmptyString(
      (metadata as Record<string, unknown>).full_name,
      (metadata as Record<string, unknown>).name,
      (metadata as Record<string, unknown>).display_name
    ) ??
    (user.email ? user.email.split("@")[0] : null) ??
    "Member";
  const email = user.email ?? "";
  const avatarValue = (metadata as Record<string, unknown>).avatar_url;

  return {
    id: user.id,
    name: inferredName,
    email,
    initials: toInitials(inferredName, email),
    avatarUrl: typeof avatarValue === "string" && avatarValue.trim().length > 0 ? avatarValue : null
  };
}

function avatarNeedsCleanup(avatarUrl: string | null) {
  if (!avatarUrl) return false;
  return avatarUrl.startsWith("data:") || avatarUrl.length > MAX_AVATAR_URL_LENGTH;
}

function mapSessionToAuthenticatedUser(session: { access_token?: string | null; user?: User | null } | null) {
  if (!session?.access_token || !session.user) return null;
  if (session.user.is_anonymous) return null;
  return mapSupabaseUser(session.user);
}

function clearPersistedAuthState() {
  try {
    const localKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key) localKeys.push(key);
    }
    localKeys.forEach((key) => {
      if (/^sb-.*-auth-token$/.test(key) || key === "supabase.auth.token") {
        localStorage.removeItem(key);
      }
    });
  } catch {
    // Best-effort cleanup only.
  }

  try {
    const sessionKeys: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key) sessionKeys.push(key);
    }
    sessionKeys.forEach((key) => {
      if (/^sb-.*-auth-token$/.test(key) || key === "supabase.auth.token") {
        sessionStorage.removeItem(key);
      }
    });
  } catch {
    // Best-effort cleanup only.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  async function resolveActiveSession() {
    const {
      data: { session },
      error
    } = await supabase.auth.getSession();

    if (error) {
      throw new Error(error.message || "Unable to read auth session.");
    }

    if (session?.access_token && session.user) {
      return session;
    }

    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      return null;
    }

    const refreshedSession = refreshData.session;
    if (refreshedSession?.access_token && refreshedSession.user) {
      return refreshedSession;
    }

    return null;
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setUser(null);
      return;
    }

    let active = true;

    async function syncSession() {
      const session = await resolveActiveSession();
      if (!active) return;
      setUser(mapSessionToAuthenticatedUser(session));
    }

    void syncSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(mapSessionToAuthenticatedUser(session));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function login(email: string, password: string) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password.trim()) {
      throw new Error("Email and password are required.");
    }
    if (!isSupabaseConfigured) {
      throw new Error("Supabase is not configured.");
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password
    });

    if (error) {
      throw new Error(error.message || "Unable to sign in.");
    }

    const session = data.session ?? (await resolveActiveSession());
    if (!session?.access_token || !session.user) {
      throw new Error("Signed in, but session token could not be established. Please try again.");
    }

    setUser(mapSupabaseUser(session.user));
  }

  async function signup(name: string, email: string, password: string) {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanName) {
      throw new Error("Name is required.");
    }
    if (!cleanEmail || !password.trim()) {
      throw new Error("Email and password are required.");
    }
    if (!isSupabaseConfigured) {
      throw new Error("Supabase is not configured.");
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanName
        }
      }
    });

    if (error) {
      throw new Error(error.message || "Unable to sign up.");
    }

    if (!data.session) {
      throw new Error("Account created. Check your email to confirm, then log in.");
    }
  }

  async function resetPassword(email: string) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      throw new Error("Email is required.");
    }
    if (!isSupabaseConfigured) {
      throw new Error("Supabase is not configured.");
    }

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/login`
    });
    if (error) {
      throw new Error(error.message || "Unable to send reset email.");
    }
  }

  async function logout() {
    if (!isSupabaseConfigured) {
      setUser(null);
      return;
    }

    setUser(null);
    clearPersistedAuthState();

    const localResult = await supabase.auth.signOut({ scope: "local" });

    if (localResult.error) {
      const fallbackResult = await supabase.auth.signOut();
      if (fallbackResult.error) return;
    }
  }

  async function updateUser(next: Partial<AuthUser>) {
    if (!user) return;

    if (!isSupabaseConfigured) {
      const merged = { ...user, ...next };
      setUser({
        ...merged,
        initials: toInitials(merged.name, merged.email)
      });
      return;
    }

    const payload: Record<string, unknown> = {};
    if (typeof next.name === "string") {
      payload.full_name = next.name.trim();
    }
    if (typeof next.avatarUrl !== "undefined") {
      if (typeof next.avatarUrl === "string") {
        const trimmedAvatar = next.avatarUrl.trim();
        if (!trimmedAvatar) {
          payload.avatar_url = null;
        } else if (avatarNeedsCleanup(trimmedAvatar)) {
          throw new Error("Avatar image is too large. Use an image URL instead of a file upload.");
        } else {
          payload.avatar_url = trimmedAvatar;
        }
      } else {
        payload.avatar_url = null;
      }
    }

    const { data, error } = await supabase.auth.updateUser({
      data: payload
    });

    if (error) {
      throw new Error(error.message || "Unable to update profile.");
    }

    if (data.user) {
      const session = await resolveActiveSession();
      setUser(mapSessionToAuthenticatedUser(session));
    }
  }

  async function changePassword(nextPassword: string) {
    const cleanPassword = nextPassword.trim();
    if (cleanPassword.length < 8) {
      throw new Error("New password must be at least 8 characters.");
    }
    if (!isSupabaseConfigured) {
      throw new Error("Supabase is not configured.");
    }

    const { error } = await supabase.auth.updateUser({
      password: cleanPassword
    });
    if (error) {
      throw new Error(error.message || "Unable to update password.");
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      login,
      signup,
      resetPassword,
      logout,
      updateUser,
      changePassword
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
