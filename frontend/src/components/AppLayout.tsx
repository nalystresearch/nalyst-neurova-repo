import { Outlet } from "react-router-dom";
import NavBar from "./NavBar";
import "./AppLayout.css";

export default function AppLayout() {
  return (
    <div className="app-shell">
      <NavBar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
