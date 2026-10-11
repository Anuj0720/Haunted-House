import { useCallback, useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import Credits from "./Credits.jsx";
import { enableSound } from "../helper/audio.js";
import { LOAD_STAGES, SITE_TITLE } from "../helper/site.js";

const SILHOUETTE = "#04080a";

// Window shapes in the order they light up (matches LOAD_STAGES), each with
// the centre of its glow.
const WINDOWS = [
  { d: "M193 200V182a9 9 0 0 1 18 0V200Z", cx: 202, cy: 188 }, // tower
  { d: "M246 252V226a12 12 0 0 1 24 0V252Z", cx: 258, cy: 240 }, // main, left
  { d: "M370 252V226a12 12 0 0 1 24 0V252Z", cx: 382, cy: 240 }, // main, right
  { d: "M443 262V244a9 9 0 0 1 18 0V262Z", cx: 452, cy: 252 }, // wing
  { d: "M309 168a11 11 0 1 0 22 0a11 11 0 1 0 -22 0Z", cx: 320, cy: 168 }, // attic
];
const DOOR = { d: "M308 282V252a12 12 0 0 1 24 0V282Z", cx: 320, cy: 264 };

const PICKETS = Array.from({ length: 18 }, (_, i) => 235 + i * 10);

function stageFor(pct) {
  let text = LOAD_STAGES[0].text;
  for (const s of LOAD_STAGES) if (pct >= s.at) text = s.text;
  return text;
}

function HouseScene({ lit, doorOpen }) {
  return (
    <svg className="hh-house" viewBox="0 0 640 340" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="hh-moon-halo">
          <stop offset="0" stopColor="#ebe1c8" stopOpacity=".26" />
          <stop offset="1" stopColor="#ebe1c8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hh-lamp">
          <stop offset="0" stopColor="#f2a94e" stopOpacity=".55" />
          <stop offset="1" stopColor="#f2a94e" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="505" cy="78" r="88" fill="url(#hh-moon-halo)" />
      <circle cx="505" cy="78" r="30" fill="#ebe1c8" />
      <g fill="#cfc4a8" opacity=".55">
        <circle cx="496" cy="72" r="5" />
        <circle cx="513" cy="89" r="3.5" />
        <circle cx="518" cy="66" r="2.5" />
      </g>

      {/* house */}
      <g fill={SILHOUETTE}>
        <rect x="230" y="190" width="180" height="92" />
        <polygon points="218,192 320,122 422,192" />
        <rect x="176" y="150" width="52" height="132" />
        <polygon points="168,152 202,96 236,152" />
        <rect x="410" y="226" width="84" height="56" />
        <polygon points="402,228 452,196 502,228" />
        <rect x="372" y="128" width="18" height="40" />
      </g>
      <path d="M202 96V78" stroke={SILHOUETTE} strokeWidth="3" />

      {/* window glows sit behind the panes */}
      {[...WINDOWS, DOOR].map((w, i) => {
        const isDoor = i === WINDOWS.length;
        const on = isDoor ? doorOpen : i < lit;
        return (
          <circle
            key={`g${i}`}
            className={`hh-glow${on ? " is-lit" : ""}`}
            cx={w.cx}
            cy={w.cy}
            r="38"
            fill="url(#hh-lamp)"
          />
        );
      })}
      {[...WINDOWS, DOOR].map((w, i) => {
        const isDoor = i === WINDOWS.length;
        const on = isDoor ? doorOpen : i < lit;
        return <path key={`w${i}`} className={`hh-pane${on ? " is-lit" : ""}`} d={w.d} />;
      })}

      {/* hill, tree, fence */}
      <path d="M0 296C110 268 210 262 320 266C440 270 540 282 640 298V340H0Z" fill={SILHOUETTE} />
      <g stroke={SILHOUETTE} strokeLinecap="round" fill="none">
        <path d="M92 300V228" strokeWidth="8" />
        <path d="M92 262 66 240M92 250 116 226M66 240 52 243M66 240 58 222M116 226 131 229M116 226 121 208M92 236 84 214" strokeWidth="3.5" />
      </g>
      <g fill={SILHOUETTE}>
        <rect x="232" y="276" width="176" height="3" />
        {PICKETS.map((x) => (
          <path key={x} d={`M${x} 298V270l3-7 3 7V298Z`} />
        ))}
      </g>
    </svg>
  );
}

export default function LoadingScreen({ onEnter }) {
  const { progress, active } = useProgress();
  const [ready, setReady] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [litCount, setLitCount] = useState(1);
  const [creditsOpen, setCreditsOpen] = useState(false);

  const pctRef = useRef(null);
  const stageRef = useRef(null);
  const barRef = useRef(null);
  const enterRef = useRef(null);
  const latest = useRef({ progress: 0, active: true });
  const shown = useRef(0);
  const readyRef = useRef(false);

  useEffect(() => {
    latest.current = { progress, active };
  }, [progress, active]);

  // Lock page scroll while this overlay is up.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);


  useEffect(() => {
    let raf = 0;
    let timer = 0;
    let armed = false;
    const last = { pct: -1, stage: "", lit: -1 };

    const tick = () => {
      const { progress: target, active: loading } = latest.current;
      const current = shown.current;
      if (current < target) {
        shown.current = Math.min(target, current + Math.max(0.5, (target - current) * 0.06));
      }

      const pct = Math.min(100, Math.round(shown.current));
      if (pct !== last.pct) {
        last.pct = pct;
        if (pctRef.current) pctRef.current.textContent = `${pct}%`;
        if (barRef.current) barRef.current.style.transform = `scaleX(${pct / 100})`;
      }

      if (!readyRef.current) {
        const stage = stageFor(pct);
        if (stage !== last.stage) {
          last.stage = stage;
          if (stageRef.current) stageRef.current.textContent = stage;
        }
      }

      const lit = LOAD_STAGES.filter((s) => pct >= s.at).length;
      if (lit !== last.lit) {
        last.lit = lit;
        setLitCount(lit);
      }

      if (!armed && shown.current >= 99.9 && !loading) {
        armed = true;
        timer = window.setTimeout(() => setReady(true), 450);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    readyRef.current = true;
    if (stageRef.current) stageRef.current.textContent = "Ready";
    enterRef.current?.focus({ preventScroll: true });
  }, [ready]);

  const handleEnter = useCallback(
    (withSound) => {
      // Runs straight from the click, which is the user gesture browsers
      // require before they allow audio.
      if (withSound) enableSound();
      setExiting(true);
      window.setTimeout(() => onEnter?.(withSound), 850);
    },
    [onEnter],
  );

  return (
    <div
      className={`hh-gate${exiting ? " is-exiting" : ""}`}
      role="dialog"
      aria-label={`Loading ${SITE_TITLE}`}
    >
      <div className="hh-gate__sky" />

      <div className="hh-gate__content">
        <HouseScene lit={litCount} doorOpen={ready} />

        <h1 className="hh-title">{SITE_TITLE}</h1>
        <p className="hh-tagline">Interactive 3D experience</p>

        <div className="hh-progress">
          <div className="hh-progress__row">
            <p ref={stageRef} className="hh-stage" aria-live="polite">
              Preparing scene
            </p>
            <p ref={pctRef} className="hh-pct">
              0%
            </p>
          </div>
          <div className="hh-bar" role="presentation">
            <div ref={barRef} className="hh-bar__fill" />
          </div>
        </div>

        <div className="hh-actions">
          {ready && (
            <>
              <button
                ref={enterRef}
                type="button"
                className="hh-btn hh-btn--primary hh-rise"
                onClick={() => handleEnter(true)}
              >
                Enter with sound
              </button>
              <button
                type="button"
                className="hh-btn hh-btn--quiet hh-rise"
                onClick={() => handleEnter(false)}
              >
                Enter without sound
              </button>
            </>
          )}
        </div>
      </div>

      <button type="button" className="hh-gate__credits" onClick={() => setCreditsOpen(true)}>
        Credits
      </button>

      <Credits open={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </div>
  );
}
