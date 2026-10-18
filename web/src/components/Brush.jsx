// A hand-drawn brush underline with a small leaf at its end. It draws itself in when shown
// and again on hover. Used under "Check a forest".
export default function Brush({ thick = 7 }) {
  return (
    <svg className="brush" viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="brushGrad" x1="0" x2="1">
          <stop offset="0" stopColor="#B4DA4E" />
          <stop offset=".6" stopColor="#3C9A68" />
          <stop offset="1" stopColor="#1F6B47" />
        </linearGradient>
        <linearGradient id="brushGradHero" x1="0" x2="1">
          <stop offset="0" stopColor="#ECFCCB" />
          <stop offset=".5" stopColor="#BEF264" />
          <stop offset="1" stopColor="#4ADE80" />
        </linearGradient>
      </defs>
      <path className="stroke" pathLength="1" strokeWidth={thick} d="M4 15 C 60 7, 120 19, 180 11 S 262 8, 284 12" />
      <path className="stroke" pathLength="1" strokeWidth={thick * 0.35} opacity=".55" d="M30 20 C 90 15, 160 21, 230 16" />
      <g className="leaf" transform="translate(284 12)">
        <path d="M0 0 C 4 -10, 13 -12, 16 -11 C 15 -6, 9 1, 0 0 Z" fill="#3C9A68" />
        <path d="M0 0 C 5 -4, 9 -7, 14 -10" stroke="#E9FBEF" strokeWidth="1" fill="none" />
      </g>
    </svg>
  );
}
