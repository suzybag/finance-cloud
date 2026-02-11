"use client";

import { useRef } from "react";

export function PicPayCardVisual() {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const isPressedRef = useRef(false);

  const applyTilt = (xPercent: number, yPercent: number) => {
    const card = cardRef.current;
    if (!card) return;

    const rx = ((50 - yPercent) / 50) * 8;
    const ry = ((xPercent - 50) / 50) * 10;
    const scale = isPressedRef.current ? 0.986 : 1;

    card.style.transform = `perspective(1200px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${scale})`;
    card.style.setProperty("--mx", `${xPercent.toFixed(2)}%`);
    card.style.setProperty("--my", `${yPercent.toFixed(2)}%`);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    applyTilt((x / rect.width) * 100, (y / rect.height) * 100);
  };

  const handleMouseLeave = () => {
    const card = cardRef.current;
    if (!card) return;

    isPressedRef.current = false;
    card.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg) scale(1)";
    card.style.setProperty("--mx", "28%");
    card.style.setProperty("--my", "22%");
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    isPressedRef.current = true;
    handleMouseMove(event);
  };

  const handleMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    isPressedRef.current = false;
    handleMouseMove(event);
  };

  return (
    <div className="group [perspective:1200px]">
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        className="relative h-[188px] w-full select-none overflow-hidden rounded-2xl border border-emerald-100/25 transition-transform duration-150 ease-out [transform-style:preserve-3d]"
        style={{
          "--mx": "28%",
          "--my": "22%",
          transform: "perspective(1200px) rotateX(0deg) rotateY(0deg) scale(1)",
          boxShadow:
            "0 14px 28px rgba(0,0,0,0.33), 0 4px 10px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.14)",
          background:
            "radial-gradient(110% 90% at var(--mx) var(--my), rgba(255,255,255,0.14), rgba(255,255,255,0) 48%), linear-gradient(132deg, #00d982 0%, #19c77c 44%, #24b976 100%)",
        } as React.CSSProperties}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/14 to-transparent" />
        <div
          className="pointer-events-none absolute -left-20 top-[-150px] h-[300px] w-[110px] rotate-[18deg] bg-white/14 blur-3xl transition-transform duration-150"
          style={{
            transform: "translateX(calc((var(--mx) - 28%) * 0.25)) rotate(18deg)",
          }}
        />

        <div className="absolute left-4 top-4 opacity-90">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6.5 8c2 1.8 2 4.2 0 6" stroke="#04150f" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M10 6.7c2.7 2.8 2.7 7 0 9.8" stroke="#04150f" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M13.5 5.4c3.5 3.7 3.5 8.9 0 12.6" stroke="#04150f" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>

        <div className="absolute left-7 top-[62px] rounded-md border border-[#7f8b84] bg-[#d4d5cf] p-[2px] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_4px_rgba(0,0,0,0.22)]">
          <div className="relative h-[28px] w-[38px] rounded-[4px] border border-[#8a8f8a] bg-[#c6c8c2]">
            <div className="absolute left-0 top-1/2 h-[1px] w-full -translate-y-1/2 bg-[#929891]" />
            <div className="absolute left-1/3 top-0 h-full w-[1px] bg-[#929891]" />
            <div className="absolute left-2/3 top-0 h-full w-[1px] bg-[#929891]" />
          </div>
        </div>

        <div className="absolute right-10 top-4">
          <div className="relative h-[42px] w-[62px]">
            <span className="absolute right-0 top-0 h-8 w-8 rounded-full bg-[#ffca28]/95" />
            <span className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-[#ff4545]/95" />
            <span className="absolute right-4 top-2 h-8 w-8 rounded-full bg-[#ff9f1c]/90 mix-blend-multiply" />
          </div>
        </div>
      </div>
    </div>
  );
}
