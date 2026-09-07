/**
 * Rotas.
 * Públicas: / (landing), /login, /cadastro, /recuperar-senha, /reset-password, /planos.
 * Protegidas por login: /dashboard, /rota, /os/*, /assinatura.
 * Protegidas por assinatura: /dashboard, /rota, /os/* (paywall, exceto modo local).
 * /reset-password é pública de propósito: o fluxo de recuperação chega sem
 * sessão normal (só com o code do e-mail).
 */
import { Navigate, createHashRouter, RouterProvider } from "react-router-dom";
import type { ReactNode } from "react";
import Dashboard from "./screens/Dashboard";
import ForgotPassword from "./screens/ForgotPassword";
import InspectionScreen from "./screens/InspectionScreen";
import Landing from "./screens/Landing";
import Login from "./screens/Login";
import OrderDetail from "./screens/OrderDetail";
import OrderForm from "./screens/OrderForm";
import ResetPassword from "./screens/ResetPassword";
import RouteOptimizer from "./screens/RouteOptimizer";
import Signup from "./screens/Signup";
import Plans from "./screens/Plans";
import Subscription from "./screens/Subscription";
import { effectiveAccess } from "./domain/billing";
import { useAuth } from "./state/auth";
import { useBilling } from "./state/billing";

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

/**
 * Paywall: exige assinatura ativa ou trial.
 * Modo local (sem Supabase) passa direto, sem cobranca.
 * Sem assinatura, cancelada ou nao paga: vai para /planos.
 * past_due: permite entrar, Dashboard exibe aviso para regularizar.
 */
function RequireSubscription({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const { status, loading, cancelAtPeriodEnd, currentPeriodEnd } = useBilling();
  if (authStatus === "local") return <>{children}</>;
  if (loading) {
    return (
      <div className="min-h-dvh bg-app text-ink">
        <main className="mx-auto max-w-xl px-4 pb-10 pt-16 text-center">
          <p className="text-[14px] font-semibold text-slate-400">Verificando assinatura…</p>
        </main>
      </div>
    );
  }
  if (effectiveAccess(status, cancelAtPeriodEnd, currentPeriodEnd)) return <>{children}</>;
  return <Navigate to="/planos" replace />;
}

/** Telas de auth: autenticado vai ao dashboard; local segue sem login. */
function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
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
  if (status === "authenticated" || status === "local") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

const router = createHashRouter([
  { path: "/", element: <Landing /> },
  { path: "/login", element: <RedirectIfAuthenticated><Login /></RedirectIfAuthenticated> },
  { path: "/cadastro", element: <RedirectIfAuthenticated><Signup /></RedirectIfAuthenticated> },
  { path: "/recuperar-senha", element: <RedirectIfAuthenticated><ForgotPassword /></RedirectIfAuthenticated> },
  { path: "/reset-password", element: <ResetPassword /> },
  { path: "/dashboard", element: <RequireAuth><RequireSubscription><Dashboard /></RequireSubscription></RequireAuth> },
  { path: "/planos", element: <Plans /> },
  { path: "/assinatura", element: <RequireAuth><Subscription /></RequireAuth> },
  { path: "/os/new", element: <RequireAuth><RequireSubscription><OrderForm mode="new" /></RequireSubscription></RequireAuth> },
  { path: "/os/:id", element: <RequireAuth><RequireSubscription><OrderDetail /></RequireSubscription></RequireAuth> },
  { path: "/os/:id/edit", element: <RequireAuth><RequireSubscription><OrderForm mode="edit" /></RequireSubscription></RequireAuth> },
  { path: "/os/:id/ficha", element: <RequireAuth><RequireSubscription><InspectionScreen /></RequireSubscription></RequireAuth> },
  { path: "/rota", element: <RequireAuth><RequireSubscription><RouteOptimizer /></RequireSubscription></RequireAuth> },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
