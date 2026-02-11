"use client";

import { useMemo, useRef } from "react";

type PicPayCardVisualProps = {
  balance: number;
};

const formatBRL = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PicPayCardVisual({ balance }: PicPayCardVisualProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const isPressedRef = useRef(false);

  const amount = useMemo(() => formatBRL(balance), [balance]);

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
    card.style.setProperty("--mx", "22%");
    card.style.setProperty("--my", "14%");
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
        className="relative h-[184px] w-full select-none overflow-hidden rounded-2xl border border-emerald-100/20 transition-transform duration-150 ease-out [transform-style:preserve-3d]"
        style={{
          "--mx": "22%",
          "--my": "14%",
          transform: "perspective(1200px) rotateX(0deg) rotateY(0deg) scale(1)",
          boxShadow:
            "0 28px 62px rgba(16, 185, 129, 0.3), 0 16px 34px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
          background:
            "radial-gradient(130% 160% at var(--mx) var(--my), rgba(255,255,255,0.34), rgba(255,255,255,0) 43%), radial-gradient(100% 130% at 100% 110%, rgba(4,38,25,0.62), rgba(4,38,25,0) 55%), linear-gradient(138deg, #0e5c44 0%, #238662 46%, #20b77a 100%)",
        } as React.CSSProperties}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-45"
          style={{
            background:
              "repeating-linear-gradient(115deg, rgba(255,255,255,0.09) 0px, rgba(255,255,255,0.09) 1px, transparent 1px, transparent 8px)",
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/18 to-transparent" />
        <div
          className="pointer-events-none absolute -left-24 top-[-130px] h-[310px] w-[170px] rotate-[18deg] bg-white/18 blur-3xl transition-transform duration-150"
          style={{
            transform: "translateX(calc((var(--mx) - 22%) * 0.35)) rotate(18deg)",
          }}
        />

        <div className="absolute left-5 top-4 text-lg font-black tracking-tight text-emerald-50 [text-shadow:0_6px_14px_rgba(0,0,0,0.28)]">
          PicPay
        </div>

        <div className="absolute right-5 top-4 opacity-95">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <path d="M8 9c3 2.8 3 7.2 0 10" stroke="rgba(255,255,255,0.95)" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M12.5 7c4.1 4.1 4.1 9.9 0 14" stroke="rgba(255,255,255,0.75)" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M17 5c5.2 5.2 5.2 12.6 0 18" stroke="rgba(255,255,255,0.52)" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </div>

        <div className="absolute right-5 top-[66px] rounded-xl border border-white/25 bg-white/18 p-2 backdrop-blur-sm">
          <div className="relative h-[42px] w-[58px] rounded-lg border border-white/15 bg-white/10">
            <div className="absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-sm bg-white/25" />
            <div className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 bg-white/30" />
            <div className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 bg-white/22" />
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-100/85">
              Saldo atual
            </p>
            <p className="mt-1 text-4xl font-black tracking-tight text-white [text-shadow:0_12px_24px_rgba(0,0,0,0.45)]">
              {amount}
            </p>
          </div>
        </div>

        <div className="absolute bottom-4 left-5 text-xs font-medium text-emerald-50/80">
          Conta digital PicPay
        </div>
      </div>
    </div>
  );
}
