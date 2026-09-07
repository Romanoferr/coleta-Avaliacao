import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { AuthProvider } from "./state/auth";
import { BillingProvider } from "./state/billing";
import { DbProvider } from "./state/store";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <BillingProvider>
      <DbProvider>
        <App />
      </DbProvider>
      </BillingProvider>
    </AuthProvider>
  </React.StrictMode>
);
