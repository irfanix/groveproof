// The person's choices: role, language, Simple or Expert view, and which alerts they want.
// Saved in this browser only. Every read/write is wrapped so blocked storage just uses defaults.
import { createContext, useContext, useEffect, useState } from "react";
import { DICT } from "./i18n";

const KEY = "groveproof-prefs";
export const ROLES = {
  company: { icon: "company", key: "role.company" },
  owner: { icon: "owner", key: "role.owner" },
  verifier: { icon: "verifier", key: "role.verifier" },
  public: { icon: "public", key: "role.public" },
};
export const NOTIFY = {
  status: "notify.status",
  expiry: "notify.expiry",
  reports: "notify.reports",
  unusual: "notify.unusual",
};
const DEFAULTS = { role: null, lang: "en", mode: "simple", notify: { status: true, expiry: true, reports: true, unusual: true }, wallet: null };

function read() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEFAULTS; }
}

const Ctx = createContext(null);

export function PrefsProvider({ children }) {
  const [prefs, setPrefs] = useState(read);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
    document.documentElement.lang = prefs.lang;
  }, [prefs]);
  const update = (patch) => setPrefs((p) => ({ ...p, ...patch }));
  const t = (key, vars) => {
    let s = DICT[prefs.lang]?.[key] ?? DICT.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
    return s;
  };
  return <Ctx.Provider value={{ prefs, update, t, expert: prefs.mode === "expert" }}>{children}</Ctx.Provider>;
}

export const usePrefs = () => useContext(Ctx);
