import { useEffect, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { START_VIEW } from "./helper/viewpoints.js";

// Manual orbit and zoom only. The scripted fly-to camera moves were removed.
export default function CameraRig() {
  const controls = useRef(null);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.target.set(...START_VIEW.target);
    c.update();
  }, []);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.07}
      rotateSpeed={0.6}
      zoomSpeed={0.7}
      enablePan={false}
      minDistance={2.5}
      maxDistance={95}
      maxPolarAngle={Math.PI * 0.52}
    />
  );
}
