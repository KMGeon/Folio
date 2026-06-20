"use client";

import { Html, Instance, Instances, OrbitControls, Text } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";

import type { ActivityDay } from "@/lib/dashboard-api";

// R3F materials can't read CSS tokens, so mirror the Folio palette here.
const BG = "#121212"; // --background
const GREEN = "#46c07c"; // --primary
const LABEL = "#7d8590"; // muted month labels
// Level 0–4 bar colors (0 = inactive tile, 4 = brightest).
const COLORS = ["#26262b", "#1f7a44", "#2ea043", "#46c07c", "#6fe39b"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const WEEKS = 53;
const DAY_MS = 24 * 60 * 60 * 1000;
const SP = 0.55; // grid spacing between days

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function level(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) {
    return 0;
  }
  if (count <= 2) {
    return 1;
  }
  if (count <= 5) {
    return 2;
  }
  if (count <= 9) {
    return 3;
  }
  return 4;
}

interface Cell {
  x: number;
  z: number;
  height: number;
  color: string;
  date: string;
  count: number;
}

interface MonthLabel {
  x: number;
  label: string;
}

interface Grid {
  cells: Cell[];
  months: MonthLabel[];
  frontZ: number;
}

// Same 53×7 day grid as the 2D heatmap, projected onto the X/Z plane, plus the
// month-start label positions so the timeline stays readable in 3D.
function buildGrid(activity: ActivityDay[]): Grid {
  const counts = new Map(activity.map((a) => [a.date, a.count]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - (today.getDay() + (WEEKS - 1) * 7) * DAY_MS);
  const xOff = -((WEEKS - 1) * SP) / 2;
  const zOff = -((7 - 1) * SP) / 2;

  const cells: Cell[] = [];
  const months: MonthLabel[] = [];
  let prevMonth = -1;

  for (let w = 0; w < WEEKS; w++) {
    const weekStart = new Date(start.getTime() + w * 7 * DAY_MS);
    const month = weekStart.getMonth();
    if (month !== prevMonth) {
      months.push({ x: xOff + w * SP, label: MONTHS[month]! });
      prevMonth = month;
    }
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getTime() + (w * 7 + d) * DAY_MS);
      if (date.getTime() > today.getTime()) {
        continue;
      }
      const key = ymd(date);
      const count = counts.get(key) ?? 0;
      cells.push({
        x: xOff + w * SP,
        z: zOff + d * SP,
        height: 0.16 + Math.min(count, 16) * 0.22,
        color: COLORS[level(count)]!,
        date: key,
        count,
      });
    }
  }
  return { cells, months, frontZ: zOff + 6 * SP + 0.55 };
}

function Skyline({ grid, reduced }: { grid: Grid; reduced: boolean }) {
  const group = useRef<Group>(null);
  const [hover, setHover] = useState<Cell | null>(null);

  // Very subtle rock keeps it alive without hurting readability; drag still works.
  useFrame((state) => {
    if (!group.current || reduced) {
      return;
    }
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.12) * 0.08;
  });

  return (
    <group ref={group}>
      <Instances limit={grid.cells.length} range={grid.cells.length}>
        <boxGeometry args={[SP * 0.84, 1, SP * 0.84]} />
        <meshStandardMaterial roughness={0.45} metalness={0.05} />
        {grid.cells.map((c, i) => (
          <Instance
            key={`${c.date}-${i}`}
            position={[c.x, c.height / 2, c.z]}
            scale={[1, c.height, 1]}
            color={c.color}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHover(c);
            }}
            onPointerOut={() => setHover(null)}
          />
        ))}
      </Instances>

      {grid.months.map((m) => (
        <Text
          key={`${m.label}-${m.x}`}
          position={[m.x, 0.02, grid.frontZ]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.5}
          color={LABEL}
          anchorX="left"
          anchorY="middle"
        >
          {m.label}
        </Text>
      ))}

      {hover ? (
        <Html
          position={[hover.x, hover.height + 0.5, hover.z]}
          center
          distanceFactor={16}
          style={{ pointerEvents: "none" }}
        >
          <div className="whitespace-nowrap rounded-md border bg-card px-2 py-1 text-xs text-foreground shadow-md">
            {hover.date} · 기여 {hover.count}개
          </div>
        </Html>
      ) : null}
    </group>
  );
}

export function ContributionsSkylineScene({ activity }: { activity: ActivityDay[] }) {
  const grid = useMemo(() => buildGrid(activity), [activity]);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Telephoto (narrow fov, far camera) flattens perspective so every bar reads at
  // a comparable size — much more legible than a wide-angle skyline.
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [6, 13, 17], fov: 16 }} gl={{ antialias: true }}>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 30, 60]} />

      <ambientLight intensity={0.65} />
      <directionalLight position={[8, 14, 6]} intensity={1.3} />
      <directionalLight position={[-6, 4, -4]} intensity={0.4} color="#9fb8ff" />
      <pointLight position={[-8, 7, 5]} intensity={45} color={GREEN} distance={48} />

      <Skyline grid={grid} reduced={reduced} />

      <OrbitControls
        enablePan={false}
        target={[0, 0.6, 0]}
        minDistance={12}
        maxDistance={32}
        minPolarAngle={0.3}
        maxPolarAngle={1.15}
      />
    </Canvas>
  );
}
