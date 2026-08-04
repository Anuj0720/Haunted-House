import * as THREE from "three";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Clouds, Cloud } from "@react-three/drei";
import { useControls } from "leva";

export default function CloudEffect() {
  const cloudRefs = useRef([]);

  const { color, x, y, z, range, ...config } = useControls("Clouds", {
    seed: { value: 31, min: 1, max: 100, step: 1 },
    segments: { value: 3, min: 1, max: 80, step: 1 },
    volume: { value: 6.6, min: 0, max: 20, step: 0.1 },
    opacity: { value: 0.20, min: 0, max: 1, step: 0.01 },
    fade: { value: 261, min: 0, max: 400, step: 1 },
    growth: { value: 5.8, min: 0, max: 20, step: 0.1 },
    speed: { value: 0.01, min: 0, max: 0.5, step: 0.005 },
    x: { value: 0, min: 0, max: 100, step: 1 },
    y: { value: 6, min: 0, max: 100, step: 1 },
    z: { value: -10, min: -10, max: 100, step: 1 },
    range: { value: 17, min: 1, max: 200, step: 1 },
    color: "#dee2e6",
  });

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;

    cloudRefs.current.forEach((cloud, index) => {
      if (!cloud) return;
      const angle = elapsed * 0.35 + (index * (Math.PI * 2)) / 3;
      const radius = 8;
      const height = 0.4 * Math.sin(elapsed * 0.5 + index);
      cloud.position.set(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius,
      );
      if (cloud.rotation) {
        cloud.rotation.y += delta * 0.05;
      }
    });
  });

  return (
    <>
      <Clouds material={THREE.MeshLambertMaterial} limit={400} range={range}>
        <Cloud
          ref={(el) => (cloudRefs.current[0] = el)}
          {...config}
          bounds={[x, y, z]}
          color={color}
          position={[6, 0, 0]}
        />
        <Cloud
          ref={(el) => (cloudRefs.current[1] = el)}
          {...config}
          bounds={[x, y, z]}
          color="#dee2e6"
          seed={2}
          position={[-6, 0, 0]}
        />
      </Clouds>
    </>
  );
}
