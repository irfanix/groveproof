// One consistent icon set for the whole app: thin line icons on a 24 x 24 grid.
// <Icon name="satellite" /> draws a bare icon; <IconTile name="satellite" /> puts it on an animated tile.
// Tiles react to the pointer: they lift, the light sweeps across, and the icon itself moves.
const P = {
  satellite: <><path d="M13.5 10.5l-3 3" /><rect x="8.6" y="8.6" width="6.8" height="6.8" rx="1.2" transform="rotate(45 12 12)" /><path d="M3.6 8.2l2.8-2.8 3.4 3.4-2.8 2.8zM14.2 18.8l2.8-2.8 3.4 3.4-2.8 2.8z" /><path className="ic-wave" d="M16 4.2a3.8 3.8 0 0 1 3.8 3.8M16 1.6a6.4 6.4 0 0 1 6.4 6.4" /></>,
  dashboard: <><rect x="3" y="3" width="7.5" height="9" rx="1.6" /><rect x="13.5" y="3" width="7.5" height="5.5" rx="1.6" /><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.6" /><rect x="3" y="15" width="7.5" height="6" rx="1.6" /><path className="ic-spark" d="M15.5 18l1.7-2 1.6 1.2 1.2-2" /></>,
  market: <><path d="M4 8h16l-1.2 11.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8z" /><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" /><path className="ic-leaf" d="M9.5 16.5c0-2.6 1.8-4.3 5-4.3 0 3.2-1.7 5-4.3 5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.4 15.4l5.1 5.1" /><path className="ic-check" d="M7.8 10.6l1.9 1.9 3.6-3.7" /></>,
  company: <><path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21" /><path d="M14 10h4.5A1.5 1.5 0 0 1 20 11.5V21" /><path d="M2.5 21h19M7.5 8h3M7.5 11.5h3M7.5 15h3M16.5 14h1M16.5 17h1" /></>,
  owner: <><path d="M12 3l5.5 7.2h-3l4 5.6H5.5l4-5.6h-3z" /><path d="M12 15.8V21M8.5 21h7" /></>,
  verifier: <><path d="M12 2.8l7.5 3.1v6.1c0 4.7-3.1 7.9-7.5 9.5-4.4-1.6-7.5-4.8-7.5-9.5V5.9z" /><path className="ic-check" d="M8.6 12.1l2.3 2.3 4.5-4.6" /></>,
  public: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle className="ic-pupil" cx="12" cy="12" r="3" /></>,
  passport: <><rect x="4.5" y="2.8" width="15" height="18.4" rx="2" /><circle cx="12" cy="10" r="3.2" /><path d="M8 16.5h8" /><path d="M9 10h6M12 6.8c1.2 1.6 1.2 4.8 0 6.4M12 6.8c-1.2 1.6-1.2 4.8 0 6.4" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1.2" /><rect x="14" y="3" width="7" height="7" rx="1.2" /><rect x="3" y="14" width="7" height="7" rx="1.2" /><path d="M14 14h3v3h-3zM18 18h3v3h-3zM18 14h3M14 18v3" /></>,
  chain: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  shield: <><path d="M12 2.8l7.5 3.1v6.1c0 4.7-3.1 7.9-7.5 9.5-4.4-1.6-7.5-4.8-7.5-9.5V5.9z" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  sparkle: <><path className="ic-twinkle" d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5 2.5l.6 1.4 1.4.6-1.4.6L5 6.5l-.6-1.4L3 4.5l1.4-.6z" /></>,
  camera: <><path d="M4 7.5h3l1.6-2.5h6.8L17 7.5h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5z" /><circle cx="12" cy="13" r="3.6" /></>,
  report: <><path d="M14 2.8H7A1.8 1.8 0 0 0 5.2 4.6v14.8A1.8 1.8 0 0 0 7 21.2h10a1.8 1.8 0 0 0 1.8-1.8V7.6z" /><path d="M14 2.8v4.8h4.8M8.8 12.5h6.4M8.8 16h6.4" /></>,
  chart: <><path d="M3.5 20.5h17" /><path d="M6 17v-5M10.5 17V7M15 17v-7M19.5 17V4.5" /></>,
  pin: <><path d="M12 21.5s-6.5-6-6.5-11.2a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11.2-6.5 11.2z" /><circle cx="12" cy="10.3" r="2.4" /></>,
  map: <><path d="M9 4.5L3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2z" /><path d="M9 4.5v13M15 6.5v13" /></>,
  sprout: <><path d="M12 21v-8.5" /><path className="ic-leaf" d="M12 12.5C12 8.4 9.3 6 4.6 6c0 4.2 2.8 6.5 7.4 6.5zM12 10.5c0-3.6 2.4-5.8 6.6-5.8 0 3.8-2.4 5.8-6.6 5.8z" /><path d="M7.5 21h9" /></>,
  handshake: <><path d="M2.5 11.5L6 8l3.5 1.5L12 8l3 1 3.5-1 3 3.5" /><path d="M6 8v6.5l4.5 4a1.6 1.6 0 0 0 2.2 0l5.8-5.5V8" /><path d="M10 12.5l2.6 2.4M12.5 11.2l2.4 2.2" /></>,
  flame: <><path className="ic-flame" d="M12 21.5c-3.9 0-6.5-2.6-6.5-6.2 0-3.6 2.9-5.4 3.6-9.3 2.3 1.3 3 3.5 3 5 1-.6 1.6-1.9 1.6-3.2 2.4 1.6 4.8 4.4 4.8 7.5 0 3.6-2.6 6.2-6.5 6.2z" /><path d="M12 21.5c-1.6 0-2.7-1.1-2.7-2.6 0-1.6 1.3-2.4 1.6-4 1.4.8 3.8 2.3 3.8 4 0 1.5-1.1 2.6-2.7 2.6z" /></>,
  refresh: <><path d="M20 11.5A8 8 0 0 0 5.5 7M4 12.5A8 8 0 0 0 18.5 17" /><path d="M5.2 3.2V7h3.8M18.8 20.8V17H15" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10.5" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.6" r="1.4" /></>,
  arrow: <><path d="M4.5 12h15M13.5 6l6 6-6 6" /></>,
  bolt: <><path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" /></>,
  forest: <><path d="M8 3l4 5.5H9.8l3.2 4.5H3l3.2-4.5H4z" /><path d="M8 13v4M16 6l3.5 5h-2l3 4h-9l3-4h-2z" /><path d="M16 15v3M2.5 21h19" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></>,
  recycle: <><path d="M7.5 9.5L10 5.2a2.3 2.3 0 0 1 4 0l1.4 2.4" /><path d="M16.5 14.5l2.3 4a2.3 2.3 0 0 1-2 3.5h-3.3M10.5 22H7.2a2.3 2.3 0 0 1-2-3.5l1.6-2.7" /><path d="M13.5 7.6h2.6V5M16.8 14.2v2.6h2.6M6.9 18.3l-1.3-2.2 2.2-1.3" /></>,
  measure: <><path d="M3.5 16.5l13-13 4 4-13 13z" /><path d="M7 13l1.5 1.5M9.5 10.5l2 2M12 8l1.5 1.5M14.5 5.5l2 2" /></>,
  calc: <><rect x="5" y="2.8" width="14" height="18.4" rx="2" /><rect x="8" y="5.8" width="8" height="3.6" rx=".8" /><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01" strokeWidth="2.4" /></>,
  note: <><path d="M5 3.5h10l4 4v13H5z" /><path d="M15 3.5v4h4M8 12h8M8 15.5h5" /></>,
  bell: <><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  gear: <><path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1" /><circle className="ic-knob1" cx="15" cy="6.5" r="2" /><circle className="ic-knob2" cx="9" cy="12" r="2" /><circle className="ic-knob3" cx="17" cy="17.5" r="2" /></>,
  leaf: <><path d="M5 19C5 10.5 10.8 5 19 5c0 8.5-5.8 14-14 14z" /><path d="M5 19l8.5-8.5" /></>,
  check: <><path d="M5 12.5l4.5 4.5L19 7.5" /></>,
};

export const ICON_NAMES = Object.keys(P);

export function Icon({ name, className = "w-5 h-5", strokeWidth = 1.75, title }) {
  return (
    <svg viewBox="0 0 24 24" className={`ic ic-${name} ${className}`} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      {P[name] || P.leaf}
    </svg>
  );
}

// tone: "green" (default, light tile), "solid" (dark green tile), "glass" (on dark backgrounds), "red", "amber", "grey"
export function IconTile({ name, size = "md", tone = "green", className = "" }) {
  const s = { sm: "w-8 h-8 rounded-[10px]", md: "w-11 h-11 rounded-[14px]", lg: "w-14 h-14 rounded-[18px]", xl: "w-16 h-16 rounded-[20px]" }[size];
  const i = { sm: "w-4 h-4", md: "w-[22px] h-[22px]", lg: "w-7 h-7", xl: "w-8 h-8" }[size];
  return (
    <span className={`itile itile-${tone} ${s} ${className}`}>
      <Icon name={name} className={i} />
    </span>
  );
}
