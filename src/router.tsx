import {
  createBrowserRouter,
  redirect,
  RouterProvider,
  type LoaderFunctionArgs
} from "react-router-dom";
import { AdminPage } from "@/pages/AdminPage";
import { RoomPage } from "@/pages/RoomPage";

function rootRedirectLoader() {
  return redirect("/room/hard-hat-system");
}

function roomLoader({ params }: LoaderFunctionArgs) {
  return {
    roomSlug: params.roomId ?? "hard-hat-system"
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
    loader: rootRedirectLoader
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
