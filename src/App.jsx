import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Float } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Leva, useControls } from "leva";
import Experience from "./Experience.jsx";

export default function App() {
  const { bgColor } = useControls("Background", {
    bgColor: { value: "#101010" },
  });

  const { bloomIntensity, luminanceThreshold, luminanceSmoothing, mipmapBlur } =
    useControls("Bloom", {
      bloomIntensity: { value: 1.84, min: 0, max: 3, step: 0.01 },
      luminanceThreshold: { value: 0.13, min: 0, max: 1, step: 0.01 },
      luminanceSmoothing: { value: 0, min: 0, max: 1, step: 0.001 },
      mipmapBlur: { value: true },
    });

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Leva collapsed={false} />
      <Canvas dpr={[1, 2]} camera={{ position: [51.2, 4, -17.4], fov: 45 }}>
        {/* Background color control from Leva */}
        <color attach="background" args={[bgColor]} />

        {/* Only ambient light as requested */}
        <ambientLight intensity={1} />

        <Suspense fallback={null}>
          <Float>
            <Experience />
          </Float>
        </Suspense>
        <CameraController />
        <EffectComposer>
          <Bloom
            intensity={bloomIntensity}
            luminanceThreshold={luminanceThreshold}
            luminanceSmoothing={luminanceSmoothing}
            mipmapBlur={mipmapBlur}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}

function CameraController() {
  const controlsRef = useRef();

  const { posX, posY, posZ, targetX, targetY, targetZ, fov } = useControls(
    "Camera",
    {
      posX: { value: 51.2, step: 0.1 },
      posY: { value: 4, step: 0.1 },
      posZ: { value: -17.4, step: 0.1 },
      targetX: { value: 0, step: 0.1 },
      targetY: { value: 3.6, step: 0.1 },
      targetZ: { value: 0, step: 0.1 },
      fov: { value: 45, min: 10, max: 120, step: 1 },
    },
  );

  useFrame((state) => {
    const cam = state.camera;
    cam.position.set(posX, posY, posZ);
    cam.fov = fov;
    cam.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.set(targetX, targetY, targetZ);
      controlsRef.current.update();
    }
  });

  return <OrbitControls ref={controlsRef} />;
}
