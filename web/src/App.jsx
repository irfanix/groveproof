// Three screens only: Check a forest, My credits, Look up a credit.
import { NavLink, Route, Routes } from "react-router-dom";
import Check from "./pages/Check";
import Credits from "./pages/Credits";
import Lookup from "./pages/Lookup";

const TABS = [
  { to: "/", label: "Check a forest", icon: "🛰️" },
  { to: "/credits", label: "My credits", icon: "🌳" },
  { to: "/lookup", label: "Look up a credit", icon: "🔍" },
];

function Logo() {
  return (
    <NavLink to="/" className="flex items-center gap-2 font-display text-xl font-extrabold">
      <img src="/hex.svg" alt="" className="w-8 h-8" /> GroveProof
    </NavLink>
  );
}

export default function App() {
  const tab = ({ isActive }) =>
    `flex items-center gap-2 px-4 min-h-[48px] rounded-xl font-bold ${isActive ? "bg-canopy text-white" : "hover:bg-paper"}`;
  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <header className="sticky top-0 z-[1000] bg-lichen/90 backdrop-blur border-b border-line">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Logo />
          <nav className="hidden sm:flex gap-1" aria-label="Main">
            {TABS.map((t) => <NavLink key={t.to} to={t.to} end className={tab}><span aria-hidden>{t.icon}</span>{t.label}</NavLink>)}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:py-10">
        <Routes>
          <Route path="/" element={<Check />} />
          <Route path="/credits" element={<Credits />} />
          <Route path="/lookup" element={<Lookup />} />
        </Routes>
      </main>

      <footer className="max-w-7xl mx-auto px-4 text-sm muted">
        Prototype on the Polygon Amoy test network. Carbon numbers use a demo method based on IPCC default factors, not an official carbon standard.
      </footer>

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-[1000] bg-paper border-t border-line grid grid-cols-3" aria-label="Main">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end className={({ isActive }) => `flex flex-col items-center justify-center py-2 min-h-[60px] text-xs font-bold ${isActive ? "text-leaf" : "text-moss"}`}>
            <span className="text-xl" aria-hidden>{t.icon}</span>{t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
