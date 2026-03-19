import { Suspense, useEffect, type ReactNode } from "react";
import {
  Outlet,
  RouterProvider,
  createBrowserRouter,
  type LoaderFunctionArgs,
  useLocation,
  useNavigation
} from "react-router-dom";
import { lazyImportComponent } from "@/lib/lazy";

const HomePage = lazyImportComponent(() => import("@/app/pages/home"), "HomePage");
const LoginPage = lazyImportComponent(() => import("@/app/pages/login"), "LoginPage");
const ForgotPasswordPage = lazyImportComponent(() => import("@/app/pages/forgot-password"), "ForgotPasswordPage");
const ResetPasswordPage = lazyImportComponent(() => import("@/app/pages/reset-password"), "ResetPasswordPage");
const SignupPage = lazyImportComponent(() => import("@/app/pages/signup"), "SignupPage");
const ProfilePage = lazyImportComponent(() => import("@/pages/ProfilePage"), "ProfilePage");
const RoomPage = lazyImportComponent(() => import("@/pages/RoomPage"), "RoomPage");
const AdminConsoleLayout = lazyImportComponent(
  () => import("@/components/admin/AdminConsoleLayout"),
  "AdminConsoleLayout"
);
const AdminDashboardPage = lazyImportComponent(() => import("@/pages/admin/AdminDashboardPage"), "AdminDashboardPage");
const AdminSupportPage = lazyImportComponent(() => import("@/pages/admin/AdminSupportPage"), "AdminSupportPage");
const AdminTicketDetailPage = lazyImportComponent(
  () => import("@/pages/admin/AdminTicketDetailPage"),
  "AdminTicketDetailPage"
);
const AdminCustomersPage = lazyImportComponent(() => import("@/pages/admin/AdminCustomersPage"), "AdminCustomersPage");
const AdminCustomerDetailPage = lazyImportComponent(
  () => import("@/pages/admin/AdminCustomerDetailPage"),
  "AdminCustomerDetailPage"
);
const AdminUsersPage = lazyImportComponent(() => import("@/pages/admin/AdminUsersPage"), "AdminUsersPage");
const AdminUserDetailPage = lazyImportComponent(() => import("@/pages/admin/AdminUserDetailPage"), "AdminUserDetailPage");
const AdminAuditPage = lazyImportComponent(() => import("@/pages/admin/AdminAuditPage"), "AdminAuditPage");
const AdminSystemPage = lazyImportComponent(() => import("@/pages/admin/AdminSystemPage"), "AdminSystemPage");

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

function RouteLoadingPage() {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--background)] text-[var(--muted-foreground)]">
      Loading...
    </div>
  );
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteLoadingPage />}>{element}</Suspense>;
}

function PageTransitionLayout() {
  const location = useLocation();
  const navigation = useNavigation();
  const transitionKey = `${location.pathname}${location.search}`;
  const isNavigating = navigation.state !== "idle";

  return (
    <div className={`page-transition-shell${isNavigating ? " is-navigating" : ""}`}>
      <div className="page-transition-layer" key={transitionKey}>
        <Outlet />
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <PageTransitionLayout />,
    children: [
      {
        path: "/",
        element: withSuspense(<HomePage />)
      },
      {
        path: "/signup",
        element: withSuspense(<SignupPage />)
      },
      {
        path: "/login",
        element: withSuspense(<LoginPage />)
      },
      {
        path: "/forgot-password",
        element: withSuspense(<ForgotPasswordPage />)
      },
      {
        path: "/reset-password",
        element: withSuspense(<ResetPasswordPage />)
      },
      {
        path: "/room/:roomId",
        loader: roomLoader,
        element: withSuspense(<RoomPage />)
      },
      {
        path: "/workspace/:workspaceId/room/:roomId",
        loader: roomLoader,
        element: withSuspense(<RoomPage />)
      },
      {
        path: "/settings/profile",
        element: withSuspense(<ProfilePage />)
      }
    ]
  },
  {
    path: "/admin",
    element: withSuspense(<AdminConsoleLayout />),
    children: [
      {
        element: <PageTransitionLayout />,
        children: [
          {
            index: true,
            element: withSuspense(<AdminDashboardPage />)
          },
          {
            path: "support",
            element: withSuspense(<AdminSupportPage />)
          },
          {
            path: "support/tickets/:ticketId",
            element: withSuspense(<AdminTicketDetailPage />)
          },
          {
            path: "customers",
            element: withSuspense(<AdminCustomersPage />)
          },
          {
            path: "customers/:orgId",
            element: withSuspense(<AdminCustomerDetailPage />)
          },
          {
            path: "users",
            element: withSuspense(<AdminUsersPage />)
          },
          {
            path: "users/:userId",
            element: withSuspense(<AdminUserDetailPage />)
          },
          {
            path: "audit",
            element: withSuspense(<AdminAuditPage />)
          },
          {
            path: "system",
            element: withSuspense(<AdminSystemPage />)
          }
        ]
      }
    ]
  },
  {
    path: "*",
    element: <NotFoundPage />
  }
]);

export function AppRouter() {
  useEffect(() => {
    document.title = "MagisterLudi";
  }, []);

  return <RouterProvider router={router} />;
}
