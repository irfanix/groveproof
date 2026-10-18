// GroveProof: Home, Check a forest, Dashboard, Marketplace, Look up a credit.
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import Assistant from "./components/Assistant";
import Brush from "./components/Brush";
import ErrorBoundary from "./components/ErrorBoundary";
import { Icon } from "./components/Icon";
import { AlertsBell, SettingsButton } from "./components/HeaderTools";
import Check from "./pages/Check";
import Credits from "./pages/Credits";
import Dashboard from "./pages/Dashboard";
import Landing from "./pages/Landing";
import Lookup from "./pages/Lookup";
import { usePrefs } from "./lib/prefs";

const TABS = [
  { to: "/check", key: "nav.check", icon: "satellite", brush: true },
  { to: "/dashboard", key: "nav.dashboard", icon: "dashboard" },
  { to: "/credits", key: "nav.market", icon: "market" },
  { to: "/lookup", key: "nav.lookup", icon: "search" },
];

function Logo() {
  return (
    <NavLink to="/" className="logo flex items-center gap-2 font-display text-xl font-extrabold shrink-0">
      <img src="/hex.svg" alt="" className="logo-img w-8 h-8" /> <span className="logo-name">GroveProof</span>
    </NavLink>
  );
}

export default function App() {
  const { t } = usePrefs();
  const loc = useLocation();
  const tab = ({ isActive }) =>
    `nav-tab relative flex items-center gap-2 px-3 xl:px-4 min-h-[44px] rounded-xl font-bold whitespace-nowrap ${isActive ? "nav-on" : "hover:bg-paper"}`;
  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <header className="sticky top-0 z-[1000] bg-lichen/90 backdrop-blur border-b border-line print:hidden">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <Logo />
          <nav className="hidden md:flex gap-1" aria-label="Main">
            {TABS.map((x) => (
              <NavLink key={x.to} to={x.to} end className={tab}>
                <Icon name={x.icon} className="w-5 h-5" />
                <span className={x.brush ? "brush-wrap brush-nav" : ""}>{t(x.key)}{x.brush && <Brush thick={5} />}</span>
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1"><AlertsBell /><SettingsButton /></div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:py-10">
        <ErrorBoundary key={loc.pathname}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/check" element={<Check />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/credits" element={<Credits />} />
          <Route path="/lookup" element={<Lookup />} />
        </Routes>
        </ErrorBoundary>
      </main>

      <footer className="max-w-7xl mx-auto px-4 text-sm muted space-y-1 print:hidden">
        <p>Built by Irfan Dawood, Andhra Pradesh, India, for the IEEE ClimateChain Global Hackathon 2026.</p>
        <p>Prototype on the Polygon Amoy test network. Carbon numbers use a demo method based on IPCC default factors, not an official carbon standard.</p>
      </footer>

      <Assistant />

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-[1000] bg-paper border-t border-line grid grid-cols-4 print:hidden" aria-label="Main">
        {TABS.map((x) => (
          <NavLink key={x.to} to={x.to} end className={({ isActive }) => `flex flex-col items-center justify-center py-2 min-h-[60px] text-[11px] font-bold text-center leading-tight ${isActive ? "text-leaf" : "text-moss"}`}>
            <Icon name={x.icon} className="w-6 h-6 mb-0.5" />{t(x.key)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
