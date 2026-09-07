/**
 * Shell de navegação. HashRouter: funciona em qualquer hospedagem estática
 * sem configuração de servidor; a API é a mesma do BrowserRouter
 * (troca de uma linha quando houver domínio próprio + backend).
 *
 * Rotas (ficha sempre aninhada à OS — sem ficha órfã):
 *   /               Dashboard + lista de OS (criar OS aqui)
 *   /os/new         Nova OS
 *   /os/:id         Detalhe OS (Dados | Ficha | Documentos)
 *   /os/:id/edit    Editar OS
 *   /os/:id/ficha   Ficha de vistoria da OS
 */
import { createHashRouter, RouterProvider } from "react-router-dom";
import Dashboard from "./screens/Dashboard";
import InspectionScreen from "./screens/InspectionScreen";
import OrderDetail from "./screens/OrderDetail";
import OrderForm from "./screens/OrderForm";

const router = createHashRouter([
  { path: "/", element: <Dashboard /> },
  { path: "/os/new", element: <OrderForm mode="new" /> },
  { path: "/os/:id", element: <OrderDetail /> },
  { path: "/os/:id/edit", element: <OrderForm mode="edit" /> },
  { path: "/os/:id/ficha", element: <InspectionScreen /> },
  { path: "*", element: <Dashboard /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
