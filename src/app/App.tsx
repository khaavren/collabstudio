import { AuthProvider } from "@/app/context/auth-context";
import { AppRouter } from "@/app/routes";

export function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
