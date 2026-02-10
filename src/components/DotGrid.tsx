"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import "./DotGrid.css";

type DotGridProps = {
  dotSize?: number;
  gap?: number;
  baseColor?: string;
  activeColor?: string;
  proximity?: number;
  speedTrigger?: number;
  shockRadius?: number;
  shockStrength?: number;
  maxSpeed?: number;
  resistance?: number;
  returnDuration?: number;
  className?: string;
  style?: React.CSSProperties;
};

type DotPoint = {
  cx: number;
  cy: number;
  xOffset: number;
  yOffset: number;
  vx: number;
  vy: number;
};

type PointerData = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  lastTime: number;
  lastX: number;
  lastY: number;
};

const throttle = <Args extends unknown[]>(fn: (...args: Args) => void, waitMs: number) => {
  let last = 0;
  return (...args: Args) => {
    const now = performance.now();
    if (now - last >= waitMs) {
      last = now;
      fn(...args);
    }
  };
};

const hexToRgb = (hex: string) => {
  const normalized = hex.replace("#", "");
  const safe = normalized.length === 3
    ? normalized
        .split("")
        .map((char) => char + char)
        .join("")
    : normalized;
  const value = Number.parseInt(safe, 16);
  if (Number.isNaN(value)) return { r: 82, g: 39, b: 255 };
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

export default function DotGrid({
  dotSize = 5,
  gap = 15,
  baseColor = "#271E37",
  activeColor = "#5227FF",
  proximity = 120,
  speedTrigger = 100,
  shockRadius = 250,
  shockStrength = 5,
  maxSpeed = 5000,
  resistance = 750,
  returnDuration = 1.5,
  className = "",
  style,
}: DotGridProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dotsRef = useRef<DotPoint[]>([]);
  const pointerRef = useRef<PointerData>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    lastTime: 0,
    lastX: 0,
    lastY: 0,
  });

  const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor]);
  const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor]);

  const buildGrid = useCallback(() => {
    const wrap = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const rect = wrap.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const cell = dotSize + gap;
    const cols = Math.max(1, Math.floor((width + gap) / cell));
    const rows = Math.max(1, Math.floor((height + gap) / cell));

    const gridW = cell * cols - gap;
    const gridH = cell * rows - gap;
    const startX = (width - gridW) / 2 + dotSize / 2;
    const startY = (height - gridH) / 2 + dotSize / 2;

    const points: DotPoint[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        points.push({
          cx: startX + col * cell,
          cy: startY + row * cell,
          xOffset: 0,
          yOffset: 0,
          vx: 0,
          vy: 0,
        });
      }
    }
    dotsRef.current = points;
  }, [dotSize, gap]);

  useEffect(() => {
    buildGrid();
    const observer = new ResizeObserver(buildGrid);
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [buildGrid]);

  useEffect(() => {
    let frameId = 0;
    let last = performance.now();
    const proxSq = proximity * proximity;
    const radius = Math.max(dotSize / 2, 0.5);
    const stiffness = Math.max(80, resistance) / 170;
    const dampingBase = Math.max(0.7, 1 - 0.45 / Math.max(0.2, returnDuration));

    const draw = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dt = Math.min(0.05, Math.max(0.008, (now - last) / 1000));
      last = now;

      const pointer = pointerRef.current;
      const damping = dampingBase ** (dt * 60);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const dot of dotsRef.current) {
        dot.vx += -dot.xOffset * stiffness * dt;
        dot.vy += -dot.yOffset * stiffness * dt;
        dot.vx *= damping;
        dot.vy *= damping;
        dot.xOffset += dot.vx * dt;
        dot.yOffset += dot.vy * dt;

        const x = dot.cx + dot.xOffset;
        const y = dot.cy + dot.yOffset;
        const dx = dot.cx - pointer.x;
        const dy = dot.cy - pointer.y;
        const dsq = dx * dx + dy * dy;

        let fill = baseColor;
        if (dsq <= proxSq) {
          const dist = Math.sqrt(dsq);
          const t = 1 - dist / proximity;
          const r = Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * t);
          const g = Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * t);
          const b = Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * t);
          fill = `rgb(${r}, ${g}, ${b})`;
        }

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
      }

      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [activeRgb, baseColor, baseRgb, dotSize, proximity, resistance, returnDuration]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const now = performance.now();
      const pointer = pointerRef.current;

      const dt = pointer.lastTime ? Math.max(16, now - pointer.lastTime) : 16;
      const dx = event.clientX - pointer.lastX;
      const dy = event.clientY - pointer.lastY;
      let vx = (dx / dt) * 1000;
      let vy = (dy / dt) * 1000;
      let speed = Math.hypot(vx, vy);
      if (speed > maxSpeed) {
        const factor = maxSpeed / speed;
        vx *= factor;
        vy *= factor;
        speed = maxSpeed;
      }

      pointer.lastTime = now;
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      pointer.vx = vx;
      pointer.vy = vy;
      pointer.speed = speed;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;

      if (speed <= speedTrigger) return;
      for (const dot of dotsRef.current) {
        const ox = dot.cx - pointer.x;
        const oy = dot.cy - pointer.y;
        const dist = Math.hypot(ox, oy);
        if (dist >= proximity) continue;
        const falloff = 1 - dist / proximity;
        dot.vx += (ox / Math.max(1, dist)) * shockStrength * 24 * falloff + vx * 0.0015;
        dot.vy += (oy / Math.max(1, dist)) * shockStrength * 24 * falloff + vy * 0.0015;
      }
    };

    const onClick = (event: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;

      for (const dot of dotsRef.current) {
        const ox = dot.cx - cx;
        const oy = dot.cy - cy;
        const dist = Math.hypot(ox, oy);
        if (dist > shockRadius) continue;
        const falloff = 1 - dist / shockRadius;
        const scale = shockStrength * 36 * falloff;
        dot.vx += (ox / Math.max(1, dist)) * scale;
        dot.vy += (oy / Math.max(1, dist)) * scale;
      }
    };

    const throttled = throttle(onMouseMove, 35);
    window.addEventListener("mousemove", throttled, { passive: true });
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("mousemove", throttled);
      window.removeEventListener("click", onClick);
    };
  }, [maxSpeed, proximity, shockRadius, shockStrength, speedTrigger]);

  return (
    <section className={`dot-grid ${className}`.trim()} style={style}>
      <div ref={wrapperRef} className="dot-grid__wrap">
        <canvas ref={canvasRef} className="dot-grid__canvas" />
      </div>
    </section>
  );
}
