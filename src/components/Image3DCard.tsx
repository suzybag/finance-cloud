"use client";

import { useRef } from "react";
import {
  CARD_VISUAL_FRAME_CLASS,
  CARD_VISUAL_IMAGE_CLASS,
  CARD_VISUAL_WRAPPER_CLASS,
} from "@/components/cardVisualStyles";

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
    <div className={CARD_VISUAL_WRAPPER_CLASS}>
      <div
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={resetTilt}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={resetTilt}
        className={`${CARD_VISUAL_FRAME_CLASS} ${className ?? ""}`}
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
          className={CARD_VISUAL_IMAGE_CLASS}
        />
      </div>
    </div>
  );
}
