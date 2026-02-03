import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import type { SecuritySurface } from "../surfaces";

type Props = {
  surfaces: SecuritySurface[];
  focusId: string | null;
  onPick: (surface: SecuritySurface) => void;
};

type Node = {
  surface: SecuritySurface;
  position: THREE.Vector3;
  baseColor: THREE.Color;
};

function colorForSeverity(sev: SecuritySurface["severity"]) {
  if (sev === "High") {
    return new THREE.Color("#ff3a73");
  }
  if (sev === "Medium") {
    return new THREE.Color("#ffd34d");
  }
  return new THREE.Color("#35ffb0");
}

function seededRandom(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function AtlasScene(props: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  const nodes = useMemo<Node[]>(() => {
    const rand = seededRandom(1337);
    const radius = 3.6;
    const list: Node[] = [];
    for (const s of props.surfaces) {
      // Distribute points on a loose sphere, with some clustering for “constellation” feel.
      const u = rand();
      const v = rand();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const jitter = (rand() - 0.5) * 0.65;
      const r = radius + jitter;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.9;
      const z = r * Math.cos(phi);
      list.push({
        surface: s,
        position: new THREE.Vector3(x, y, z),
        baseColor: colorForSeverity(s.severity),
      });
    }
    return list;
  }, [props.surfaces]);

  const focus = useMemo(() => {
    if (!props.focusId) {
      return null;
    }
    return nodes.find((n) => n.surface.id === props.focusId) ?? null;
  }, [nodes, props.focusId]);

  const linesGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];

    // Build “constellation” edges: for each node, connect to its nearest neighbors.
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const nearest = nodes
        .map((b, idx) => ({ idx, d: a.position.distanceTo(b.position) }))
        .filter((x) => x.idx !== i)
        .toSorted((x, y) => x.d - y.d)
        .slice(0, 2);
      for (const n of nearest) {
        const b = nodes[n.idx];
        positions.push(a.position.x, a.position.y, a.position.z);
        positions.push(b.position.x, b.position.y, b.position.z);
      }
    }

    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [nodes]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const g = groupRef.current;
    if (g) {
      g.rotation.y = t * 0.05;
      g.rotation.x = Math.sin(t * 0.22) * 0.04;
    }
    const glow = glowRef.current;
    if (glow && focus) {
      glow.position.lerp(focus.position, 0.08);
      glow.scale.setScalar(1.0 + Math.sin(t * 2.0) * 0.06);
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={glowRef} position={[0, 0, 0]}>
        <sphereGeometry args={[0.62, 32, 32]} />
        <meshBasicMaterial color={"#7c5cff"} transparent opacity={0.08} />
      </mesh>

      <lineSegments geometry={linesGeo}>
        <lineBasicMaterial color={"#aab6ff"} transparent opacity={0.14} />
      </lineSegments>

      {nodes.map((n) => (
        <group key={n.surface.id} position={n.position.toArray()}>
          <mesh
            onClick={(e) => {
              e.stopPropagation();
              props.onPick(n.surface);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              document.body.style.cursor = "default";
            }}
          >
            <sphereGeometry args={[0.13, 32, 32]} />
            <meshStandardMaterial
              color={n.baseColor}
              emissive={n.baseColor}
              emissiveIntensity={0.6}
              metalness={0.0}
              roughness={0.25}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.23, 32, 32]} />
            <meshBasicMaterial color={n.baseColor} transparent opacity={0.08} />
          </mesh>
          <Html
            center
            style={{
              pointerEvents: "none",
              transform: "translateY(-26px)",
              whiteSpace: "nowrap",
              opacity: focus?.surface.id === n.surface.id ? 1 : 0.82,
              filter: "drop-shadow(0 10px 25px rgba(0,0,0,0.45))",
            }}
          >
            <div
              style={{
                fontSize: 11,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(10,12,22,0.55)",
                color: "rgba(255,255,255,0.86)",
              }}
            >
              {n.surface.title}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}
