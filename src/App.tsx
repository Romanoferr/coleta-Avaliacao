/**
 * Rotas.
 * Públicas: / (landing) e /login.
 * Protegidas: /dashboard e /os/* (exigem sessão; modo local dispensa login).
 */
import { Navigate, createHashRouter, RouterProvider } from "react-router-dom";
import type { ReactNode } from "react";
import Dashboard from "./screens/Dashboard";
import InspectionScreen from "./screens/InspectionScreen";
import Landing from "./screens/Landing";
import Login from "./screens/Login";
import OrderDetail from "./screens/OrderDetail";
import OrderForm from "./screens/OrderForm";
import { useAuth } from "./state/auth";

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <div className="min-h-dvh bg-app text-ink">
        <main className="mx-auto max-w-xl px-4 pb-10 pt-16 text-center">
          <p className="text-[14px] font-semibold text-slate-400">Verificando sessão…</p>
        </main>
      </div>
    );
  }
  if (status === "local" || status === "authenticated") return <>{children}</>;
  return <Navigate to="/login" replace />;
}

const router = createHashRouter([
  { path: "/", element: <Landing /> },
  { path: "/login", element: <Login /> },
  { path: "/dashboard", element: <RequireAuth><Dashboard /></RequireAuth> },
  { path: "/os/new", element: <RequireAuth><OrderForm mode="new" /></RequireAuth> },
  { path: "/os/:id", element: <RequireAuth><OrderDetail /></RequireAuth> },
  { path: "/os/:id/edit", element: <RequireAuth><OrderForm mode="edit" /></RequireAuth> },
  { path: "/os/:id/ficha", element: <RequireAuth><InspectionScreen /></RequireAuth> },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
