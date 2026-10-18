import { Icon } from "./Icon";
// Verdict names, colours and icons. Colour is never used alone: always icon + words.
export const VERDICTS = {
  Verified: { label: "Verified", icon: "✓", color: "text-leaf", bg: "bg-leaf", ring: "border-leaf",
    meaning: "Satellites clearly show healthy forest.", next: "Credits can be created." },
  NeedsReview: { label: "Needs review", icon: "?", color: "text-amberleaf", bg: "bg-amberleaf", ring: "border-amberleaf",
    meaning: "The evidence is not strong enough yet.", next: "No credits until a person takes a look." },
  NotEligible: { label: "Not eligible", icon: "✕", color: "text-ember", bg: "bg-ember", ring: "border-ember",
    meaning: "Satellites show tree loss, or the land is mostly not forest.", next: "No credits are created." },
  AlreadyClaimed: { label: "Already claimed", icon: "⧉", color: "text-river", bg: "bg-river", ring: "border-river",
    meaning: "This land overlaps a registered project.", next: "The contract refuses it: land counts once." },
  CantCheckYet: { label: "Can't check yet", icon: "☁", color: "text-mist", bg: "bg-mist", ring: "border-mist",
    meaning: "Clouds hide too much of the land.", next: "Try again with other dates." },
  None: { label: "Not checked", icon: "·", color: "text-moss", bg: "bg-moss", ring: "border-moss",
    meaning: "No satellite check recorded yet.", next: "" },
};

export function Hex({ className = "", children }) {
  return <span className={`hex inline-flex items-center justify-center ${className}`}>{children}</span>;
}

// Round, 3D-looking icon used on the Check screen (light from the top left, soft shadow below).
export function Orb({ className = "", children }) {
  return <span className={`orb inline-flex items-center justify-center ${className}`}>{children}</span>;
}

export function VerdictBadge({ verdict, small = false, round = false }) {
  const v = VERDICTS[verdict] || VERDICTS.None;
  const Icon = round ? Orb : Hex;
  return (
    <span className={`inline-flex items-center gap-2 font-bold ${v.color} ${small ? "text-sm" : ""}`}>
      <Icon className={`${v.bg} text-white ${small ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm"}`}>{v.icon}</Icon>
      {v.label}
    </span>
  );
}

// Living credits status badge
export function ForestBadge({ frozen }) {
  return frozen ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ember/10 text-ember px-3 py-1 text-sm font-bold">
      <Icon name="lock" className="w-4 h-4" /> Frozen: forest loss detected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf/10 text-leaf px-3 py-1 text-sm font-bold">
      <Icon name="leaf" className="w-4 h-4" /> Forest healthy
    </span>
  );
}
