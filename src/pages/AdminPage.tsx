import { Navigate } from "react-router-dom";

// Backward-compatible entry point: /admin now uses nested admin console routes.
export function AdminPage() {
  return <Navigate replace to="/admin" />;
}
