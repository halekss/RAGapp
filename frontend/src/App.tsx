import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
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
      background: "#111110",
      color: "#6a6763",
      fontFamily: "'DM Mono', monospace",
      gap: "12px",
    }}>
      <span style={{ fontSize: "48px", color: "#e8a23a", opacity: 0.4 }}>404</span>
      <span style={{ fontSize: "13px" }}>Page introuvable</span>
      <a href="/chat" style={{ fontSize: "12px", color: "#e8a23a", textDecoration: "none" }}>
        → Retour au Chat
      </a>
    </div>
  );
}

function Sidebar() {
  return (
    <nav className="app-nav">
      <div className="app-nav__brand">◈ Veille RAG</div>
      <NavLink
        to="/chat"
        className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M14 1H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3l3 3 3-3h3a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
        </svg>
        Chat
      </NavLink>
      <NavLink
        to="/dashboard"
        className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
          <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
          <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
          <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
        </svg>
        Dashboard
      </NavLink>
      <NavLink
        to="/admin"
        className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        Admin
      </NavLink>
    </nav>
  );
}

function Layout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-content">
        <Routes>
          <Route path="/"          element={<Navigate to="/chat" replace />} />
          <Route path="/chat"      element={<Chat />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin"     element={<Admin />} />
          <Route path="*"          element={<NotFound />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </QueryClientProvider>
  );
}