import { RouterProvider, createBrowserRouter, type LoaderFunctionArgs } from "react-router-dom";
import { HomePage } from "@/app/pages/home";
import { LoginPage } from "@/app/pages/login";
import { ForgotPasswordPage } from "@/app/pages/forgot-password";
import { SignupPage } from "@/app/pages/signup";
import { AdminPage } from "@/pages/AdminPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { RoomPage } from "@/pages/RoomPage";

function roomLoader({ params }: LoaderFunctionArgs) {
  return {
    roomSlug: params.roomId ?? ""
  };
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
    path: "/forgot-password",
    element: <ForgotPasswordPage />
  },
  {
    path: "/room/:roomId",
    loader: roomLoader,
    element: <RoomPage />
  },
  {
    path: "/workspace/:workspaceId/room/:roomId",
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
