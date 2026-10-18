// Header tools: the alerts bell and the settings panel (language, role, view, alerts).
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { hasChain } from "../lib/chain";
import { LANGS } from "../lib/i18n";
import { NOTIFY, ROLES, usePrefs } from "../lib/prefs";
import { alertsFor, loadRegistry } from "../lib/registry";
import { Icon } from "./Icon";

function useOutside(ref, onOut) {
  useEffect(() => {
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    document.addEventListener("pointerdown", f);
    return () => document.removeEventListener("pointerdown", f);
  }, [ref, onOut]);
}

export function AlertsBell() {
  const { prefs, t } = usePrefs();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const box = useRef(null);
  useOutside(box, () => setOpen(false));
  useEffect(() => {
    if (!hasChain()) return;
    let alive = true;
    const run = () => loadRegistry().then((reg) => alive && setAlerts(alertsFor(reg, { role: prefs.role || "public", address: prefs.wallet, prefs }))).catch(() => {});
    run();
    const id = setInterval(run, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [prefs]);
  const high = alerts.filter((a) => a.level === "high").length;
  return (
    <div className="relative" ref={box}>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label={`${t("nav.alerts")}: ${alerts.length}`} aria-expanded={open}>
        <Icon name="bell" className="w-5 h-5" />
        {alerts.length > 0 && <span className={`absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[11px] font-bold text-white flex items-center justify-center ${high ? "bg-ember" : "bg-amberleaf"}`}>{alerts.length}</span>}
      </button>
      {open && (
        <div className="pop absolute right-0 mt-2 w-[min(360px,calc(100vw-2rem))] rounded-2xl bg-white border border-line p-2 z-[1200]">
          <div className="px-3 py-2 font-bold flex justify-between"><span>{t("nav.alerts")}</span><span className="text-xs muted font-normal">{ROLES[prefs.role || "public"] && t(ROLES[prefs.role || "public"].key)}</span></div>
          {alerts.length === 0 && <p className="px-3 pb-3 text-sm muted">{t("nav.noalerts")}</p>}
          <ul className="max-h-80 overflow-y-auto">
            {alerts.map((a, i) => (
              <li key={i}>
                <Link to={`/lookup?q=GP-${a.project}`} onClick={() => setOpen(false)} className="flex gap-3 px-3 py-2 rounded-xl hover:bg-lichen text-sm">
                  <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${a.level === "high" ? "bg-ember" : "bg-amberleaf"}`} />
                  <span>{a.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function SettingsButton() {
  const { prefs, update, t } = usePrefs();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useOutside(box, () => setOpen(false));
  return (
    <div className="relative" ref={box}>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label={t("nav.settings")} aria-expanded={open}>
        <Icon name="gear" className="w-5 h-5" />
      </button>
      {open && (
        <div className="pop absolute right-0 mt-2 w-[min(380px,calc(100vw-2rem))] rounded-2xl bg-white border border-line p-4 z-[1200] space-y-4 text-sm">
          <div>
            <div className="font-bold mb-2">{t("settings.lang")}</div>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(LANGS).map(([k, v]) => <button key={k} onClick={() => update({ lang: k })} className={`chip justify-center ${prefs.lang === k ? "chip-on" : ""}`}>{v}</button>)}
            </div>
          </div>
          <div>
            <div className="font-bold mb-2">{t("settings.role")}</div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(ROLES).map(([k, r]) => <button key={k} onClick={() => update({ role: k })} className={`chip ${prefs.role === k ? "chip-on" : ""}`}><Icon name={r.icon} className="w-4 h-4" /> {t(r.key)}</button>)}
            </div>
          </div>
          <div>
            <div className="font-bold mb-2">{t("settings.mode")}</div>
            <div className="grid grid-cols-2 gap-2">
              {["simple", "expert"].map((k) => (
                <button key={k} onClick={() => update({ mode: k })} className={`choice text-left rounded-xl border p-3 ${prefs.mode === k ? "border-leaf bg-leaf/5" : "border-line"}`}>
                  <div className="font-bold">{t(`settings.${k}`)}</div><div className="text-xs muted">{t(`settings.${k}.d`)}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="font-bold mb-2">{t("settings.notify")}</div>
            {Object.entries(NOTIFY).map(([k, key]) => (
              <label key={k} className="flex items-center justify-between py-1.5">
                <span>{t(key)}</span>
                <input type="checkbox" className="toggle" checked={prefs.notify?.[k] !== false} onChange={(e) => update({ notify: { ...prefs.notify, [k]: e.target.checked } })} />
              </label>
            ))}
          </div>
          <p className="text-xs muted">Saved only in this browser. Some pages are still in English.</p>
        </div>
      )}
    </div>
  );
}
