// Talks to the GroveProof verifier API (the satellite checker).
export const API = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

async function call(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
  } catch {
    throw new Error("The satellite checker cannot be reached. It may be starting up; please try again in a minute.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `The satellite checker answered with error ${res.status}.`);
  return body;
}

export const getHealth = () => call("/api/health");
export const getSamples = () => call("/api/samples").then((b) => b.samples);
export const runCheck = (body) => call("/api/check", { method: "POST", body: JSON.stringify(body) });
export const getCheck = (id) => call(`/api/checks/${id}`);
export const getCheckByRecipe = (hash) => call(`/api/checks/by-recipe/${hash}`);
export const recordOnChain = (projectId, checkId) =>
  call(`/api/record/${projectId}?check_id=${encodeURIComponent(checkId)}`, { method: "POST" });
export const recheck = (projectId, body) =>
  call(`/api/recheck/${projectId}`, { method: "POST", body: JSON.stringify(body) });
export const rerunCheck = (checkId) => call(`/api/rerun/${checkId}`, { method: "POST" });
export const fileUrl = (checkId, name) => `${API}/api/checks/${checkId}/${name}`;

// Evidence, human review and the assistant
export const getEvidence = (projectId, checkId) =>
  call(`/api/evidence/${projectId}${checkId ? `?check_id=${encodeURIComponent(checkId)}` : ""}`);
export const addEvidence = (projectId, body) => call(`/api/evidence/${projectId}`, { method: "POST", body: JSON.stringify(body) });
export const addClaim = (projectId, body) => call(`/api/evidence/${projectId}/claims`, { method: "POST", body: JSON.stringify(body) });
export const addReview = (projectId, body) => call(`/api/evidence/${projectId}/review`, { method: "POST", body: JSON.stringify(body) });
export const getReviewQueue = () => call("/api/review-queue");
export const evidenceFileUrl = (projectId, file) => `${API}/api/evidence/${projectId}/file/${encodeURIComponent(file)}`;
export const askAssistant = (question, facts) => call("/api/assistant", { method: "POST", body: JSON.stringify({ question, facts }) });
