import { Routes, Route, Navigate } from "react-router-dom";
import { EmployeesPage } from "./components/EmployeesPage";

function Topbar() {
  return (
    <header className="topbar">
      <div className="topbar-logo">
        <div className="topbar-logo-icon">E</div>
        Employee Directory
      </div>
      <div className="topbar-divider" />
      <span className="topbar-tag">QA Pipeline · Demo App</span>
    </header>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <Topbar />
      <main className="main-content">
        <Routes>
          <Route path="/"           element={<EmployeesPage />} />
          <Route path="*"           element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
