"use client";

import { useRef } from "react";

export type StyledBankKey = "nubank" | "bradesco" | "inter" | "xp" | "btg";

type Bank3DCardVisualProps = {
  bankKey: StyledBankKey;
};

const CARD_THEME: Record<
  StyledBankKey,
  {
    background: string;
    borderColor: string;
    shadow: string;
    title: string;
    subtitle?: string;
    textColor: string;
    network: "visa" | "mastercard";
    chipSide: "left" | "right";
  }
> = {
  nubank: {
    background:
      "radial-gradient(130% 120% at 0% 100%, rgba(216,132,255,0.45), rgba(216,132,255,0) 52%), linear-gradient(138deg, #8f31f2 0%, #5f1ccf 48%, #310a84 100%)",
    borderColor: "rgba(213,180,255,0.58)",
    shadow: "0 14px 30px rgba(44,10,104,0.6), 0 5px 14px rgba(0,0,0,0.42)",
    title: "nu",
    subtitle: "Ultravioleta",
    textColor: "#f5f2ff",
    network: "mastercard",
    chipSide: "right",
  },
  bradesco: {
    background:
      "repeating-linear-gradient(95deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 10px), linear-gradient(135deg, #1f2531 0%, #090d15 52%, #020306 100%)",
    borderColor: "rgba(255,255,255,0.26)",
    shadow: "0 14px 30px rgba(0,0,0,0.68), 0 5px 14px rgba(0,0,0,0.5)",
    title: "bradesco",
    textColor: "#ecf0f5",
    network: "visa",
    chipSide: "left",
  },
  inter: {
    background:
      "radial-gradient(120% 120% at 0% 0%, rgba(255,255,255,0.14), rgba(255,255,255,0) 43%), linear-gradient(135deg, #323844 0%, #141a25 55%, #080b11 100%)",
    borderColor: "rgba(255,255,255,0.24)",
    shadow: "0 14px 30px rgba(0,0,0,0.64), 0 5px 14px rgba(0,0,0,0.46)",
    title: "inter",
    subtitle: "black",
    textColor: "#f3f4f7",
    network: "mastercard",
    chipSide: "left",
  },
  xp: {
    background:
      "repeating-linear-gradient(95deg, rgba(255,255,255,0.13) 0px, rgba(255,255,255,0.13) 1px, transparent 1px, transparent 7px), linear-gradient(135deg, #61656e 0%, #2a2f38 54%, #11141a 100%)",
    borderColor: "rgba(255,255,255,0.24)",
    shadow: "0 14px 30px rgba(0,0,0,0.66), 0 5px 14px rgba(0,0,0,0.48)",
    title: "XP",
    subtitle: "Infinite",
    textColor: "#f5f5f6",
    network: "visa",
    chipSide: "left",
  },
  btg: {
    background:
      "radial-gradient(100% 130% at 100% 0%, rgba(255,255,255,0.2), rgba(255,255,255,0) 46%), linear-gradient(135deg, #0b59d4 0%, #053f9d 52%, #02245c 100%)",
    borderColor: "rgba(176,218,255,0.58)",
    shadow: "0 14px 30px rgba(1,31,78,0.62), 0 5px 14px rgba(0,0,0,0.42)",
    title: "btg pactual",
    textColor: "#eff6ff",
    network: "mastercard",
    chipSide: "left",
  },
};

function Contactless({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M8 8c2.8 2.7 2.8 7.3 0 10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 6.5c3.9 3.8 3.9 9.2 0 13" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M16 5c5 5 5 11 0 16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CardChip() {
  return (
    <div className="rounded-md border border-white/40 bg-white/85 p-[2px] shadow-[0_2px_4px_rgba(0,0,0,0.32)]">
      <div className="relative h-[24px] w-[34px] rounded-[4px] border border-slate-500/55 bg-gradient-to-br from-slate-100 to-slate-300">
        <div className="absolute left-0 top-1/2 h-[1px] w-full -translate-y-1/2 bg-slate-500/70" />
        <div className="absolute left-1/3 top-0 h-full w-[1px] bg-slate-500/65" />
        <div className="absolute left-2/3 top-0 h-full w-[1px] bg-slate-500/65" />
      </div>
    </div>
  );
}

function Network({ type, color }: { type: "visa" | "mastercard"; color: string }) {
  if (type === "visa") {
    return <p className="text-[34px] font-black italic leading-none tracking-tight" style={{ color }}>VISA</p>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="relative h-7 w-[46px]">
        <span className="absolute left-0 top-1 h-5 w-5 rounded-full bg-[#ea001b]" />
        <span className="absolute right-0 top-1 h-5 w-5 rounded-full bg-[#ffb700]" />
        <span className="absolute left-3 top-1 h-5 w-5 rounded-full bg-[#ff7b00]/85 mix-blend-multiply" />
      </div>
      <p className="text-[10px] font-semibold leading-none tracking-tight" style={{ color }}>
        mastercard
      </p>
    </div>
  );
}

export function Bank3DCardVisual({ bankKey }: Bank3DCardVisualProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const pressedRef = useRef(false);
  const theme = CARD_THEME[bankKey];

  const applyTilt = (xPercent: number, yPercent: number) => {
    const card = cardRef.current;
    if (!card) return;

    const rx = ((50 - yPercent) / 50) * 7;
    const ry = ((xPercent - 50) / 50) * 9;
    const scale = pressedRef.current ? 0.988 : 1;

    card.style.transform = `perspective(1300px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${scale})`;
    card.style.setProperty("--mx", `${xPercent.toFixed(2)}%`);
    card.style.setProperty("--my", `${yPercent.toFixed(2)}%`);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    applyTilt(x, y);
  };

  const handleMouseLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    pressedRef.current = false;
    card.style.transform = "perspective(1300px) rotateX(0deg) rotateY(0deg) scale(1)";
    card.style.setProperty("--mx", "26%");
    card.style.setProperty("--my", "20%");
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    pressedRef.current = true;
    handleMouseMove(event);
  };

  const handleMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    pressedRef.current = false;
    handleMouseMove(event);
  };

  return (
    <div className="mx-auto w-full max-w-[470px] [perspective:1300px]">
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        className="relative h-[154px] w-full overflow-hidden rounded-xl border px-4 py-3 transition-transform duration-150 ease-out [transform-style:preserve-3d]"
        style={{
          "--mx": "26%",
          "--my": "20%",
          background: theme.background,
          borderColor: theme.borderColor,
          boxShadow: theme.shadow,
          transform: "perspective(1300px) rotateX(0deg) rotateY(0deg) scale(1)",
        } as React.CSSProperties}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-35"
          style={{
            background:
              "radial-gradient(100% 120% at var(--mx) var(--my), rgba(255,255,255,0.24), rgba(255,255,255,0) 46%)",
          }}
        />

        <div className="absolute left-4 top-3">
          <div className="flex items-end gap-2">
            <p className={`font-black leading-none ${bankKey === "nubank" ? "text-[40px]" : "text-[27px]"}`} style={{ color: theme.textColor }}>
              {theme.title}
            </p>
            {theme.subtitle ? (
              <p className="mb-[4px] text-sm font-medium leading-none" style={{ color: theme.textColor }}>
                {theme.subtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="absolute right-4 top-3 opacity-90">
          <Contactless color={theme.textColor} />
        </div>

        <div className={`absolute top-[58px] ${theme.chipSide === "left" ? "left-4" : "right-5"}`}>
          <CardChip />
        </div>

        <div className="absolute bottom-2 right-4">
          <Network type={theme.network} color={theme.textColor} />
        </div>
      </div>
    </div>
  );
}
