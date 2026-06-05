import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Chat from "./pages/Chat";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function NotFound() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      background: "#0e0e0f",
      color: "#4a4845",
      fontFamily: "'DM Mono', monospace",
      gap: "12px",
    }}>
      <span style={{ fontSize: "48px", color: "#c9a84c", opacity: 0.4 }}>404</span>
      <span style={{ fontSize: "13px" }}>Page introuvable</span>
      <a href="/chat" style={{ fontSize: "12px", color: "#c9a84c", textDecoration: "none" }}>
        → Retour au Chat
      </a>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/"          element={<Navigate to="/chat" replace />} />
          <Route path="/chat"      element={<Chat />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin"     element={<Admin />} />
          <Route path="*"          element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}