"use client";

import { Float, RoundedBox, Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";

// R3F materials can't read CSS tokens, so mirror the Folio (Astryx gothic)
// palette here. Keep these in sync with globals.css if the tokens change.
const BG = "#0d0f11"; // --background
const SLAB = "#16191c"; // --card
const GREEN = "#3fd97e"; // --primary / vivid green (action, ready)
const AMBER = "#ffc53d"; // --warning / medium risk

const CHAPTERS = [GREEN, AMBER, GREEN, GREEN, AMBER];

/** A floating, slowly turning stack of chapter slabs — the PR as a book. */
function ChapterStack() {
  const group = useRef<Group>(null);

  useFrame((state) => {
    if (!group.current) {
      return;
    }
    const t = state.clock.elapsedTime;
    group.current.rotation.y = Math.sin(t * 0.18) * 0.5 - 0.35;
    group.current.rotation.x = Math.sin(t * 0.12) * 0.05 + 0.04;
  });

  return (
    <group ref={group} position={[0, 0, 0]}>
      {CHAPTERS.map((accent, i) => {
        const y = (i - (CHAPTERS.length - 1) / 2) * 0.62;
        return (
          <Float key={i} speed={1.4} rotationIntensity={0.12} floatIntensity={0.35}>
            <group position={[0, y, 0]}>
              <RoundedBox args={[3.4, 0.46, 2.2]} radius={0.08} smoothness={4}>
                <meshStandardMaterial color={SLAB} roughness={0.55} metalness={0} />
              </RoundedBox>
              {/* the chapter's accent spine — green = ready, amber = needs care */}
              <mesh position={[-1.72, 0, 0]}>
                <boxGeometry args={[0.05, 0.46, 2.2]} />
                <meshStandardMaterial
                  color={accent}
                  emissive={accent}
                  emissiveIntensity={1.6}
                  toneMapped={false}
                />
              </mesh>
            </group>
          </Float>
        );
      })}
    </group>
  );
}

export function ChapterScene() {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [4.2, 1.6, 6.4], fov: 38 }} gl={{ antialias: true }}>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 9, 18]} />

      {/* lights only — no drei Environment: its async CDN HDR breaks the GL
          context under Next dev StrictMode double-mount (1s-then-black). */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 8, 4]} intensity={1.4} />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} color="#a3b5d6" />
      {/* single green key light gives the dark slabs their rim glow */}
      <pointLight position={[-5, 2, 3]} intensity={45} color={GREEN} distance={22} />

      <ChapterStack />
      <Sparkles count={36} scale={[8, 6, 8]} size={2} speed={0.3} color={GREEN} opacity={0.5} />
    </Canvas>
  );
}
