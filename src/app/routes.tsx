import { RouterProvider, createBrowserRouter, type LoaderFunctionArgs } from "react-router-dom";
import { HomePage } from "@/app/pages/home";
import { LoginPage } from "@/app/pages/login";
import { ForgotPasswordPage } from "@/app/pages/forgot-password";
import { ResetPasswordPage } from "@/app/pages/reset-password";
import { SignupPage } from "@/app/pages/signup";
import { ProfilePage } from "@/pages/ProfilePage";
import { RoomPage } from "@/pages/RoomPage";
import { AdminConsoleLayout } from "@/components/admin/AdminConsoleLayout";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { AdminSupportPage } from "@/pages/admin/AdminSupportPage";
import { AdminTicketDetailPage } from "@/pages/admin/AdminTicketDetailPage";
import { AdminCustomersPage } from "@/pages/admin/AdminCustomersPage";
import { AdminCustomerDetailPage } from "@/pages/admin/AdminCustomerDetailPage";
import { AdminUsersPage } from "@/pages/admin/AdminUsersPage";
import { AdminUserDetailPage } from "@/pages/admin/AdminUserDetailPage";
import { AdminAuditPage } from "@/pages/admin/AdminAuditPage";
import { AdminSystemPage } from "@/pages/admin/AdminSystemPage";

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
    path: "/reset-password",
    element: <ResetPasswordPage />
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
    element: <AdminConsoleLayout />,
    children: [
      {
        index: true,
        element: <AdminDashboardPage />
      },
      {
        path: "support",
        element: <AdminSupportPage />
      },
      {
        path: "support/tickets/:ticketId",
        element: <AdminTicketDetailPage />
      },
      {
        path: "customers",
        element: <AdminCustomersPage />
      },
      {
        path: "customers/:orgId",
        element: <AdminCustomerDetailPage />
      },
      {
        path: "users",
        element: <AdminUsersPage />
      },
      {
        path: "users/:userId",
        element: <AdminUserDetailPage />
      },
      {
        path: "audit",
        element: <AdminAuditPage />
      },
      {
        path: "system",
        element: <AdminSystemPage />
      }
    ]
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
