"use client";

import { useRef } from "react";

type Image3DCardProps = {
  src: string;
  alt: string;
  className?: string;
};

export function Image3DCard({ src, alt, className }: Image3DCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const pressedRef = useRef(false);

  const applyTilt = (xPercent: number, yPercent: number) => {
    const card = cardRef.current;
    if (!card) return;

    const rx = ((50 - yPercent) / 50) * 8;
    const ry = ((xPercent - 50) / 50) * 10;
    const scale = pressedRef.current ? 0.986 : 1;

    card.style.transform = `perspective(1200px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${scale})`;
    card.style.setProperty("--mx", `${xPercent.toFixed(2)}%`);
    card.style.setProperty("--my", `${yPercent.toFixed(2)}%`);
  };

  const resetTilt = () => {
    const card = cardRef.current;
    if (!card) return;

    pressedRef.current = false;
    card.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg) scale(1)";
    card.style.setProperty("--mx", "26%");
    card.style.setProperty("--my", "20%");
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    applyTilt(x, y);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pressedRef.current = true;
    handlePointerMove(event);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pressedRef.current = false;
    handlePointerMove(event);
  };

  return (
    <div className="mx-auto w-full max-w-[280px] [perspective:1200px]">
      <div
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={resetTilt}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={resetTilt}
        className={`relative aspect-[1.586/1] w-full overflow-hidden rounded-[16px] border border-transparent bg-transparent shadow-none transition-transform duration-150 ease-out [transform-style:preserve-3d] ${className ?? ""}`}
        style={
          {
            "--mx": "26%",
            "--my": "20%",
            transform: "perspective(1200px) rotateX(0deg) rotateY(0deg) scale(1)",
          } as React.CSSProperties
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="pointer-events-none absolute inset-0 block h-full w-full max-h-full max-w-full select-none object-contain object-center [transform:translateZ(44px)_scale(1.06)] drop-shadow-[0_14px_28px_rgba(0,0,0,0.58)]"
        />
      </div>
    </div>
  );
}
