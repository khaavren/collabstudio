import { Suspense, lazy, type ComponentType, type ReactNode } from "react";
import {
  Outlet,
  RouterProvider,
  createBrowserRouter,
  type LoaderFunctionArgs,
  useLocation,
  useNavigation
} from "react-router-dom";

function lazyPage<TModule extends Record<string, unknown>>(
  loader: () => Promise<TModule>,
  exportName: keyof TModule
) {
  return lazy(async () => {
    const module = await loader();

    return {
      default: module[exportName] as ComponentType
    };
  });
}

const HomePage = lazyPage(() => import("@/app/pages/home"), "HomePage");
const LoginPage = lazyPage(() => import("@/app/pages/login"), "LoginPage");
const ForgotPasswordPage = lazyPage(() => import("@/app/pages/forgot-password"), "ForgotPasswordPage");
const ResetPasswordPage = lazyPage(() => import("@/app/pages/reset-password"), "ResetPasswordPage");
const SignupPage = lazyPage(() => import("@/app/pages/signup"), "SignupPage");
const ProfilePage = lazyPage(() => import("@/pages/ProfilePage"), "ProfilePage");
const RoomPage = lazyPage(() => import("@/pages/RoomPage"), "RoomPage");
const AdminConsoleLayout = lazyPage(
  () => import("@/components/admin/AdminConsoleLayout"),
  "AdminConsoleLayout"
);
const AdminDashboardPage = lazyPage(() => import("@/pages/admin/AdminDashboardPage"), "AdminDashboardPage");
const AdminSupportPage = lazyPage(() => import("@/pages/admin/AdminSupportPage"), "AdminSupportPage");
const AdminTicketDetailPage = lazyPage(
  () => import("@/pages/admin/AdminTicketDetailPage"),
  "AdminTicketDetailPage"
);
const AdminCustomersPage = lazyPage(() => import("@/pages/admin/AdminCustomersPage"), "AdminCustomersPage");
const AdminCustomerDetailPage = lazyPage(
  () => import("@/pages/admin/AdminCustomerDetailPage"),
  "AdminCustomerDetailPage"
);
const AdminUsersPage = lazyPage(() => import("@/pages/admin/AdminUsersPage"), "AdminUsersPage");
const AdminUserDetailPage = lazyPage(() => import("@/pages/admin/AdminUserDetailPage"), "AdminUserDetailPage");
const AdminAuditPage = lazyPage(() => import("@/pages/admin/AdminAuditPage"), "AdminAuditPage");
const AdminSystemPage = lazyPage(() => import("@/pages/admin/AdminSystemPage"), "AdminSystemPage");

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
  return <RouterProvider router={router} />;
}
