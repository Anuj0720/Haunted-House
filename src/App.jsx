import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, PerformanceMonitor } from "@react-three/drei";
import { EffectComposer, Bloom, SMAA } from "@react-three/postprocessing";
import { Leva, useControls } from "leva";
import * as THREE from "three";
import Experience from "./Experience.jsx";
import CloudEffect from "./CloudEffect.jsx";
import Bat from "./Bat.jsx";
import Ghost from "./Ghost.jsx";
import LoadingScreen from "./UI/LoadingScreen.jsx";
import CameraRig from "./CameraRig.jsx";
import SafeBoundary from "./SafeBoundary.jsx";
import Hud from "./Hud.jsx";
import ParticleField from "./shaders/ParticleField.jsx";
import ToonEffect from "./shaders/ToonEffect.jsx";
import SkyEffect from "./shaders/SkyEffect.jsx";
import { START_VIEW } from "./helper/viewpoints.js";
import { toggleSound } from "./helper/audio.js";

// Tuning panel and FPS stats are hidden unless the URL has ?debug or #debug.
const DEBUG =
  typeof window !== "undefined" &&
  (new URLSearchParams(window.location.search).has("debug") ||
    window.location.hash === "#debug");

// Loaded only in debug mode, so it stays out of the normal bundle.
const Perf = lazy(() => import("r3f-perf").then((m) => ({ default: m.Perf })));

// Compiles the scene's materials without blocking the page (when the browser
// supports parallel shader compilation), right after the assets finish loading.
function Warmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    gl.compileAsync?.(scene, camera)?.catch?.(() => {});
  }, [gl, scene, camera]);
  return null;
}

function Lighting({ fxOn }) {
  const { bgColor, ambient, fill } = useControls("Lighting", {
    bgColor: { value: "#000000", label: "Background" },
    ambient: { value: 0.8, min: 0, max: 3, step: 0.05 },
    fill: { value: 0.5, min: 0, max: 3, step: 0.05, label: "Camera fill light" },
  });
  const fillRef = useRef();

  // A soft light that rides along with the camera, so ghost faces turned
  // toward you are always lit instead of falling into flat ambient shade.
  useFrame(({ camera }) => {
    fillRef.current?.position.copy(camera.position);
  });

  return (
    <>
      {/* With the effects on, the night sky paints the backdrop; start from its own navy instead of pure black. */}
      <color attach="background" args={[fxOn ? "#000000" : bgColor]} />
      <ambientLight intensity={ambient} />
      <directionalLight ref={fillRef} intensity={fill} color="#cfe0ff" />
    </>
  );
}

function Effects({ look, warm }) {
  const toonOn = look !== "none";
  // Which palette the passes use. While everything is fading out it keeps the
  // look that was showing, instead of morphing into the other one on the way out.
  const lastMoon = useRef(false);
  if (toonOn) lastMoon.current = look === "moon";
  const dreamOn = lastMoon.current;

  const { intensity, luminanceThreshold, luminanceSmoothing, radius } = useControls("Bloom", {
    intensity: { value: 1.0, min: 0, max: 3, step: 0.01 },
    luminanceThreshold: { value: 0.5, min: 0, max: 1, step: 0.01 },
    luminanceSmoothing: { value: 0.08, min: 0, max: 1, step: 0.001 },
    radius: { value: 0.7, min: 0, max: 1, step: 0.01 },
  });

  // Moonlight bloom: the white-moon look glows a little harder around the moon.
  // Driven through a plain number prop (never a ref on <Bloom>: some versions of
  // @react-three/postprocessing JSON.stringify the effect's props, and a ref to a
  // three.js object is circular, which crashed the page with a black screen).
  const [bloomBoost, setBloomBoost] = useState(0);
  const boostRef = useRef(0);
  useFrame((_, delta) => {
    boostRef.current = THREE.MathUtils.damp(boostRef.current, dreamOn ? 1 : 0, 1.6, delta);
    const stepped = Math.round(boostRef.current * 25) / 25; // ~25 re-renders per transition
    setBloomBoost((prev) => (prev === stepped ? prev : stepped));
  });

  // The sky shader is the most expensive one to compile. It is added shortly after
  // entering (while nothing is switched on yet) so the first toggle is instant, and
  // then stays mounted so toggling never recompiles it.
  const [skyMounted, setSkyMounted] = useState(false);
  useEffect(() => {
    if (toonOn) {
      setSkyMounted(true);
      return undefined;
    }
    if (!warm) return undefined;
    const t = window.setTimeout(() => setSkyMounted(true), 1500);
    return () => window.clearTimeout(t);
  }, [toonOn, warm]);

  // The toon pass is only part of the chain while it is on or fading out.
  const [toonMounted, setToonMounted] = useState(false);
  useEffect(() => {
    if (toonOn) setToonMounted(true);
  }, [toonOn]);
  const handleHidden = useCallback(() => setToonMounted(false), []);

  // Mip-map blur is the cheaper, smoother bloom. MSAA on the composer is
  // replaced by SMAA, which costs far less on integrated and mobile GPUs.
  return (
    <EffectComposer multisampling={0}>
      {/* Night sky + moon + mist are painted by this pass, behind the ink pass. */}
      {skyMounted && <SkyEffect active={toonOn} dream={dreamOn} />}
      {toonMounted && <ToonEffect active={toonOn} dream={dreamOn} onHidden={handleHidden} />}
      <Bloom
        mipmapBlur
        intensity={intensity * (1 + 0.3 * bloomBoost)}
        luminanceThreshold={luminanceThreshold}
        luminanceSmoothing={luminanceSmoothing}
        radius={radius}
      />
      <SMAA />
    </EffectComposer>
  );
}

export default function App() {
  const [entered, setEntered] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  // Which shader look is showing. Nothing is on at start; the two looks are
  // mutually exclusive: switching one on switches the other off (crossfaded).
  const [look, setLook] = useState("none"); // "none" | "blood" | "moon"
  const fxRunning = look !== "none";

  const maxDpr = useMemo(() => Math.min(window.devicePixelRatio || 1, 1.75), []);
  // Start at 1x so the very first frame (texture upload, post-processing buffers)
  // is light; the performance monitor raises it again if the GPU has room.
  const [dpr, setDpr] = useState(1);
  const [glLost, setGlLost] = useState(false);

  const handleEnter = useCallback((withSound) => {
    setSoundOn(withSound);
    setEntered(true);
  }, []);

  const handleToggleSound = useCallback(async () => {
    setSoundOn(await toggleSound());
  }, []);

  const toggleBlood = useCallback(() => setLook((l) => (l === "blood" ? "none" : "blood")), []);
  const toggleMoon = useCallback(() => setLook((l) => (l === "moon" ? "none" : "moon")), []);

  // E toggles the blood-moon look, D the white-moon look, M sound.
  useEffect(() => {
    if (!entered) return;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true']")) return;
      const k = e.key.toLowerCase();
      if (k === "e") toggleBlood();
      else if (k === "d") toggleMoon();
      else if (k === "m") handleToggleSound();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entered, toggleBlood, toggleMoon, handleToggleSound]);

  return (
    <div className="hh-root">
      <div className="hh-canvas">
        <Canvas
          dpr={dpr}
          camera={{ position: START_VIEW.position, fov: 45, near: 0.1, far: 500 }}
          gl={{ antialias: false, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener("webglcontextlost", (e) => {
              e.preventDefault();
              setGlLost(true);
            });
          }}
        >
          {/* Drops the render resolution when frames get slow, raises it again when they recover. */}
          <PerformanceMonitor
            flipflops={3}
            onChange={({ factor }) => setDpr(Math.round((0.75 + (maxDpr - 0.75) * factor) * 10) / 10)}
            onFallback={() => setDpr(1)}
          />

          <Lighting fxOn={fxRunning} />

          <Suspense fallback={null}>
            <Float>
              <Experience />
            </Float>
            <SafeBoundary name="bats">
              <Bat />
            </SafeBoundary>
            <SafeBoundary name="ghosts">
              <Ghost />
            </SafeBoundary>
            {/* The cloud sprite is fetched from a CDN: if it fails, skip clouds instead of blanking the scene. */}
            <Warmup />
            <SafeBoundary name="clouds">
              <CloudEffect active={fxRunning} />
            </SafeBoundary>
          </Suspense>

          <ParticleField active={fxRunning} />

          <CameraRig />
          <Effects look={look} warm={entered} />

          {DEBUG && (
            <Suspense fallback={null}>
              <Perf position="top-left" />
            </Suspense>
          )}
        </Canvas>
      </div>

      <div className="hh-vignette" aria-hidden="true" />

      <Leva hidden={!DEBUG} collapsed />

      {glLost && (
        <div className="hh-fatal" role="alert">
          <h1>The graphics context was lost</h1>
          <p>The browser dropped the WebGL context (usually the GPU ran out of memory or reset).</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}

      {entered && (
        <Hud
          soundOn={soundOn}
          onToggleSound={handleToggleSound}
          bloodOn={look === "blood"}
          onToggleBlood={toggleBlood}
          moonOn={look === "moon"}
          onToggleMoon={toggleMoon}
        />
      )}

      {!entered && <LoadingScreen onEnter={handleEnter} />}
    </div>
  );
}
