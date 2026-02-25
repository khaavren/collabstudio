import { createContext, useContext, useEffect, useMemo, useState } from "react";

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
  logout: () => void;
  updateUser: (next: Partial<AuthUser>) => void;
};

const AUTH_STORAGE_KEY = "magisterludi.auth.user";
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

function buildMockUser(name: string, email: string): AuthUser {
  return {
    id: "1",
    name: name.trim() || email.split("@")[0] || "User",
    email: email.trim().toLowerCase(),
    initials: toInitials(name, email),
    avatarUrl: null
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as AuthUser;
      if (!parsed?.id || !parsed?.email) return;
      setUser(parsed);
    } catch {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, []);

  function persist(nextUser: AuthUser | null) {
    setUser(nextUser);
    if (!nextUser) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser));
  }

  async function login(email: string, _password: string) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      throw new Error("Email is required.");
    }

    const inferredName = cleanEmail.split("@")[0] || "User";
    const nextUser = buildMockUser(inferredName, cleanEmail);
    persist(nextUser);
  }

  async function signup(name: string, email: string, _password: string) {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanName) {
      throw new Error("Name is required.");
    }

    if (!cleanEmail) {
      throw new Error("Email is required.");
    }

    const nextUser = buildMockUser(cleanName, cleanEmail);
    persist(nextUser);
  }

  async function resetPassword(email: string) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      throw new Error("Email is required.");
    }
  }

  function logout() {
    persist(null);
  }

  function updateUser(next: Partial<AuthUser>) {
    if (!user) return;

    const merged = {
      ...user,
      ...next
    };
    const finalized = {
      ...merged,
      initials: toInitials(merged.name, merged.email)
    };
    persist(finalized);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      login,
      signup,
      resetPassword,
      logout,
      updateUser
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
