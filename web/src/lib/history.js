// "Your checks": the last few checks, remembered in this browser only (no account, nothing sent anywhere).
// Every read and write is wrapped in try/catch, so private windows or blocked storage just show nothing.
const KEY = "groveproof-recent-checks";
const NAME_KEY = "groveproof-forest-name";
const MAX = 5;

export function recentChecks() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function rememberCheck(payload, name, sampleId = null) {
  if (!payload?.check_id) return;
  const r = payload.result;
  const item = {
    check_id: payload.check_id,
    name: name || "My forest",
    sample_id: sampleId,
    verdict: r.verdict,
    credits: r.credits?.credits ?? 0,
    forest_ha: r.numbers?.forest_after_ha ?? null,
    at: new Date().toISOString(),
  };
  try {
    const list = recentChecks().filter((x) => x.check_id !== item.check_id);
    localStorage.setItem(KEY, JSON.stringify([item, ...list].slice(0, MAX)));
  } catch { /* storage blocked: fine */ }
}

export function forgetChecks() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function savedForestName() {
  try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }
}

export function saveForestName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
}

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}
