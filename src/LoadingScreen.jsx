import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useProgress } from "@react-three/drei";

const LABELS = [
  { at: 0, text: "lighting the lanterns" },
  { at: 25, text: "summoning the mist" },
  { at: 55, text: "waking the ghosts" },
  { at: 80, text: "tightening the chains" },
  { at: 99, text: "the gate creaks open" },
];

function labelFor(pct) {
  let current = LABELS[0].text;
  for (const l of LABELS) if (pct >= l.at) current = l.text;
  return current;
}

const rand = () => Math.random();

const CIRCUMFERENCE = 2 * Math.PI * 54;

export default function LoadingScreen({ onEnter }) {
  const { progress, active } = useProgress();
  const [ready, setReady] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const [svgFailed, setSvgFailed] = useState(false);

  const pctTextRef = useRef(null);
  const labelTextRef = useRef(null);
  const ringRef = useRef(null);
  const displayRef = useRef(0);
  const readyTimerRef = useRef(null);

  // Lock page scroll while this overlay is up.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    let raf;

    const tick = () => {
      const current = displayRef.current;
      if (current < progress) {
        const step = Math.max(0.5, (progress - current) * 0.06);
        displayRef.current = Math.min(progress, current + step);
      }

      const pct = Math.min(100, Math.round(displayRef.current));

      if (pctTextRef.current) pctTextRef.current.textContent = `${pct}%`;
      if (labelTextRef.current) labelTextRef.current.textContent = labelFor(pct);
      if (ringRef.current) {
        ringRef.current.style.strokeDashoffset = CIRCUMFERENCE * (1 - pct / 100);
      }

      if (displayRef.current >= 99.9 && !active && !readyTimerRef.current) {
        readyTimerRef.current = setTimeout(() => setReady(true), 450);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(readyTimerRef.current);
    };
  }, [progress, active]);

  useEffect(() => {
    if (labelTextRef.current && ready) labelTextRef.current.textContent = "the shrine awaits";
  }, [ready]);

  const handleEnter = useCallback(
    (withSound) => {
      // Fired synchronously from the button's onClick — this is the user
      // gesture browsers require before they'll allow audio playback.
      if (withSound) {
        try {
          const audio = new Audio("/sounds/background.mp3");
          audio.loop = true;
          audio.volume = 0.6;
          audio.play().catch(() => {
          });
        } catch {
          // Ignore — missing file or unsupported format shouldn't block entry.
        }
      }
      setExiting(true);
      setTimeout(() => onEnter?.(withSound), 850);
    },
    [onEnter]
  );

  const embers = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        left: rand() * 100,
        delay: rand() * 9,
        duration: 7 + rand() * 6,
        size: 2 + rand() * 3,
        drift: (rand() - 0.5) * 80,
      })),
    []
  );

  const bats = useMemo(
    () =>
      Array.from({ length: 3 }, (_, i) => ({
        id: i,
        top: 10 + rand() * 30,
        delay: i * 3.5,
        duration: 16 + rand() * 8,
      })),
    []
  );

  return (
    <div
      className={`fixed inset-0 z-[100] overflow-hidden bg-[#06070a] transition-opacity duration-[850ms] ease-in-out ${
        exiting ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{ position: "fixed", inset: 0, zIndex: 100, overflow: "hidden", backgroundColor: "#06070a" }}
      role="dialog"
      aria-label="Loading the shrine"
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Inter:wght@400;500;600&display=swap');

        @font-face {
          font-family: 'Toxia';
          src: url('/fonts/toxia.ttf') format('truetype');
          font-weight: 400 700;
          font-style: normal;
          font-display: swap;
        }

        .ls-font-display { font-family: 'Toxia', 'Cinzel', serif; }
        .ls-font-brush { font-family: 'Toxia', 'Ma Shan Zheng', cursive; }
        .ls-font-ui { font-family: 'Toxia', 'Inter', sans-serif; }
        /* Body copy with punctuation (quotes, parens) — Toxia is a display
           font and substitutes odd glyphs for straight quote marks, so
           dense text like the credits list stays on a normal typeface. */
        .ls-font-body { font-family: 'Inter', sans-serif; }

        @keyframes ls-ember-rise {
          0% { transform: translate3d(0, 10vh, 0) translateX(0); opacity: 0; }
          10% { opacity: 0.9; }
          90% { opacity: 0.5; }
          100% { transform: translate3d(0, -100vh, 0) translateX(var(--drift)); opacity: 0; }
        }
        .ls-ember {
          position: absolute;
          bottom: 0;
          border-radius: 9999px;
          background: radial-gradient(circle, #ffb877 0%, #ff8a3d 45%, rgba(255,138,61,0) 75%);
          animation-name: ls-ember-rise;
          animation-timing-function: ease-in;
          animation-iteration-count: infinite;
          will-change: transform, opacity;
        }

        @keyframes ls-bat-fly {
          0% { transform: translateX(-10vw) translateY(0); opacity: 0; }
          8% { opacity: 0.55; }
          50% { transform: translateX(55vw) translateY(-18px); }
          92% { opacity: 0.5; }
          100% { transform: translateX(115vw) translateY(6px); opacity: 0; }
        }
        .ls-bat { position: absolute; animation-name: ls-bat-fly; animation-timing-function: ease-in-out; animation-iteration-count: infinite; will-change: transform, opacity; }

        @keyframes ls-rise-in {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ls-rise-in { animation: ls-rise-in 0.6s ease-out both; }

        @keyframes ls-modal-in {
          from { opacity: 0; transform: scale(0.96) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .ls-modal-in { animation: ls-modal-in 0.25s ease-out both; }

        @keyframes ls-spin { to { transform: rotate(360deg); } }
        .ls-spin { animation: ls-spin 1.4s linear infinite; }
      `}</style>

      {/* atmosphere */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 62%, rgba(47,107,99,0.22) 0%, rgba(6,7,10,0) 60%), radial-gradient(ellipse 60% 40% at 50% 30%, rgba(138,35,50,0.16) 0%, rgba(6,7,10,0) 65%), #06070a",
        }}
      />

      {bats.map((b) => (
        <svg
          key={b.id}
          className="ls-bat"
          style={{ top: `${b.top}%`, animationDuration: `${b.duration}s`, animationDelay: `${b.delay}s` }}
          width="26"
          height="10"
          viewBox="0 0 26 10"
          fill="none"
        >
          <path
            d="M13 4C11 1 7 0 0 2c3 1.2 5 2.4 6.5 4C5 7.6 3 8.8 0 10c7-1 11-2.6 13-6 2 3.4 6 5 13 6-3-1.2-5-2.4-6.5-4C21 4.4 23 3.2 26 2c-7-2-11-1-13 2z"
            fill="rgba(180,210,205,0.5)"
          />
        </svg>
      ))}

      {embers.map((e) => (
        <span
          key={e.id}
          className="ls-ember"
          style={{
            left: `${e.left}%`,
            width: e.size,
            height: e.size,
            animationDuration: `${e.duration}s`,
            animationDelay: `${e.delay}s`,
            ["--drift"]: `${e.drift}px`,
          }}
        />
      ))}

      {/* content */}
      <div
        className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center"
        style={{ position: "relative", zIndex: 10, display: "flex", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
      >
        <span className="ls-font-brush mb-1 select-none text-3xl text-[#8a2332]/80">入</span>

        <h1
          className="ls-font-display text-3xl font-semibold tracking-[0.18em] text-[#ece3d1] sm:text-4xl"
          style={{ fontSize: 32, fontWeight: 600, letterSpacing: "0.18em", color: "#ece3d1", margin: 0 }}
        >
          THE WANDERING SHRINE
        </h1>
        <p className="ls-font-ui mt-2 text-[11px] uppercase tracking-[0.4em] text-[#a89f8c]">
          an offering awaits within
        </p>

        <div
          className="relative my-10 flex h-36 w-36 items-center justify-center sm:h-40 sm:w-40"
          style={{ position: "relative", width: 144, height: 144, margin: "40px 0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <svg
            className="absolute inset-0 -rotate-90"
            viewBox="0 0 120 120"
            width="100%"
            height="100%"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }}
          >
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(236,227,209,0.08)" strokeWidth="1.5" />
            <circle
              ref={ringRef}
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="#ff8a3d"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE}
              style={{ filter: "drop-shadow(0 0 6px rgba(255,138,61,0.6))" }}
            />
          </svg>

          {!svgFailed ? (
            <img
              src="/loading.svg"
              alt=""
              width={128}
              height={128}
              onError={() => setSvgFailed(true)}
              className="h-14 w-14 object-contain opacity-90"
              style={{ width: 128, height: 128, maxWidth: 128, maxHeight: 128, objectFit: "contain", opacity: 0.9 }}
            />
          ) : (
            <div
              className="ls-spin h-10 w-10 rounded-full border border-[#ece3d1]/20 border-t-[#ff8a3d]/70"
              style={{ width: 40, height: 40, borderRadius: 9999 }}
            />
          )}
        </div>

        <p
          ref={pctTextRef}
          className="ls-font-ui text-2xl tabular-nums tracking-wider text-[#ece3d1]"
        >
          0%
        </p>
        <p
          ref={labelTextRef}
          className="ls-font-ui mt-1 h-4 text-[10px] uppercase tracking-[0.35em] text-[#a89f8c]"
        >
          lighting the lanterns
        </p>

        <div className="mt-10 flex h-12 items-center gap-4">
          {ready && (
            <div className="ls-rise-in flex flex-col items-center gap-4 sm:flex-row">
              <button
                type="button"
                onClick={() => handleEnter(true)}
                className="ls-font-ui group flex cursor-pointer items-center gap-2 rounded-sm border border-[#ff8a3d]/40 bg-[#ff8a3d]/10 px-8 py-3.5 text-xs uppercase tracking-[0.2em] text-[#ece3d1] transition-all duration-200 hover:border-[#ff8a3d]/80 hover:bg-[#ff8a3d]/20 hover:shadow-[0_0_18px_rgba(255,138,61,0.35)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff8a3d]"
                style={{ cursor: "pointer", padding: "14px 32px" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
                </svg>
                Enter with Sound
              </button>
              <button
                type="button"
                onClick={() => handleEnter(false)}
                className="ls-font-ui group flex cursor-pointer items-center gap-2 rounded-sm border border-[#ece3d1]/20 bg-transparent px-8 py-3.5 text-xs uppercase tracking-[0.2em] text-[#a89f8c] transition-all duration-200 hover:border-[#ece3d1]/50 hover:text-[#ece3d1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ece3d1]"
                style={{ cursor: "pointer", padding: "14px 32px" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                  <path d="m17 9 5 6M22 9l-5 6" />
                </svg>
                Enter without sound
              </button>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowCredits(true)}
        className="ls-font-ui absolute bottom-6 right-6 z-20 cursor-pointer p-2 text-[10px] uppercase tracking-[0.3em] text-[#a89f8c]/70 underline decoration-[#a89f8c]/30 underline-offset-4 transition-colors hover:text-[#ece3d1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ece3d1]"
        style={{ position: "absolute", bottom: 16, right: 16, zIndex: 20, cursor: "pointer", pointerEvents: "auto" }}
      >
        credits
      </button>

      {showCredits && <CreditsModal onClose={() => setShowCredits(false)} />}
    </div>
  );
}

function CreditsModal({ onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const linkClass =
    "cursor-pointer text-[#ff8a3d] underline decoration-[#ff8a3d]/40 underline-offset-2 transition-colors hover:text-[#ffb877] hover:decoration-[#ffb877]";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
      style={{ position: "fixed", inset: 0, zIndex: 110, pointerEvents: "auto" }}
      onMouseDown={(e) => {
        if (!panelRef.current?.contains(e.target)) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="ls-modal-in ls-font-ui w-full max-w-md rounded-sm border border-[#ece3d1]/15 bg-[#0b0c0f] p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)]"
        style={{ padding: 32, maxHeight: "80vh", overflowY: "auto" }}
      >
        <div className="mb-6 flex items-center justify-between" style={{ marginBottom: 24 }}>
          <h2 className="ls-font-display text-sm uppercase tracking-[0.25em] text-[#ece3d1]">Credits</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close credits"
            className="cursor-pointer p-1 text-[#a89f8c] transition-colors hover:text-[#ece3d1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ece3d1]"
            style={{ cursor: "pointer" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="ls-font-body flex flex-col text-xs leading-relaxed text-[#a89f8c]" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ marginBottom: 24 }}>
            <p
              className="ls-font-display mb-2 text-[10px] uppercase tracking-[0.25em] text-[#ece3d1]/70"
              style={{ marginBottom: 10 }}
            >
              Sound
            </p>
            <p>
              Music by{" "}
              <a
                href="https://pixabay.com/users/soundgallerybydmitrytaras-11640913/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=400868"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                Dmitry Taras
              </a>{" "}
              from{" "}
              <a
                href="https://pixabay.com/music//?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=400868"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                Pixabay
              </a>
              .
            </p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <p
              className="ls-font-display mb-2 text-[10px] uppercase tracking-[0.25em] text-[#ece3d1]/70"
              style={{ marginBottom: 10 }}
            >
              3D Models
            </p>
            <ul className="space-y-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <li>
                &ldquo;
                <a href="https://skfb.ly/oqxoF" target="_blank" rel="noopener noreferrer" className={linkClass}>
                  Haunted House (Halloween)
                </a>
                &rdquo; by Conrad Justin is licensed under{" "}
                <a
                  href="http://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  Creative Commons Attribution
                </a>
                .
              </li>
              <li>
                &ldquo;
                <a href="https://skfb.ly/owpLM" target="_blank" rel="noopener noreferrer" className={linkClass}>
                  Emerald Bat
                </a>
                &rdquo; by CataRackta is licensed under{" "}
                <a
                  href="http://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  Creative Commons Attribution
                </a>
                .
              </li>
              <li>
                &ldquo;
                <a href="https://skfb.ly/oMUDz" target="_blank" rel="noopener noreferrer" className={linkClass}>
                  Rigged Animated Ghost
                </a>
                &rdquo; by Dani is licensed under{" "}
                <a
                  href="http://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  Creative Commons Attribution
                </a>
                .
              </li>
            </ul>
          </div>

          <div>
            <p
              className="ls-font-display mb-2 text-[10px] uppercase tracking-[0.25em] text-[#ece3d1]/70"
              style={{ marginBottom: 10 }}
            >
              Website
            </p>
            <p>
              Built by{" "}
              <a href="https://x.com/Anuj_0720" target="_blank" rel="noopener noreferrer" className={linkClass}>
                Anuj
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}