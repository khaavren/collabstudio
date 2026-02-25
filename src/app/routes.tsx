import { Link, RouterProvider, createBrowserRouter, type LoaderFunctionArgs } from "react-router-dom";
import { HomePage } from "@/app/pages/home";
import { AdminPage } from "@/pages/AdminPage";
import { RoomPage } from "@/pages/RoomPage";

function roomLoader({ params }: LoaderFunctionArgs) {
  return {
    roomSlug: params.roomId ?? "hard-hat-system"
  };
}

function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6">
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
  );
}

function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">Login</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          Use the admin sign-in to manage team and infrastructure settings.
        </p>
        <Link
          className="mt-5 inline-flex rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--accent)]"
          to="/admin"
        >
          Go to Admin Login
        </Link>
      </div>
    </main>
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
    path: "*",
    element: <NotFoundPage />
  }
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
