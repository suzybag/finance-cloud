"use client";

import { useRef } from "react";
import { Image3DCard } from "@/components/Image3DCard";
import { CARD_VISUAL_FRAME_CLASS, CARD_VISUAL_WRAPPER_CLASS } from "@/components/cardVisualStyles";

export type StyledBankKey =
  | "nubank"
  | "bradesco"
  | "inter"
  | "mercadopago"
  | "btg"
  | "xp"
  | "santander"
  | "caixa"
  | "c6bank"
  | "wise"
  | "nomad"
  | "bancodobrasil";

type Bank3DCardVisualProps = {
  bankKey: StyledBankKey;
};

const CARD_IMAGE_MAP: Partial<Record<StyledBankKey, string>> = {
  bradesco: "/cards/bradesco-aeternum.png",
  santander: "/cards/santander-unlimited.png",
  btg: "/cards/btg-pactual.webp",
  xp: "/cards/xp-infinite.png",
  c6bank: "/cards/c6-carbon.png",
  wise: "/cards/wise-card.png",
  nomad: "/cards/nomad-debit.png",
  bancodobrasil: "/cards/bbce-ourocard.png",
};

const CARD_THEME: Record<
  StyledBankKey,
  {
    background: string;
    borderColor: string;
    shadow: string;
    textColor: string;
  }
> = {
  nubank: {
    background:
      "radial-gradient(120% 120% at 0% 100%, rgba(201,130,255,0.38), rgba(201,130,255,0) 50%), linear-gradient(136deg, #5b1fb8 0%, #2f0b7d 56%, #190447 100%)",
    borderColor: "rgba(211,183,255,0.58)",
    shadow: "0 12px 24px rgba(39,8,92,0.62), 0 4px 10px rgba(0,0,0,0.42)",
    textColor: "#f7f4ff",
  },
  bradesco: {
    background:
      "repeating-linear-gradient(95deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 10px), linear-gradient(138deg, #13161d 0%, #05070d 58%, #020306 100%)",
    borderColor: "rgba(255,255,255,0.28)",
    shadow: "0 12px 24px rgba(0,0,0,0.72), 0 4px 10px rgba(0,0,0,0.52)",
    textColor: "#d7dce5",
  },
  inter: {
    background:
      "radial-gradient(120% 120% at 100% 0%, rgba(255,255,255,0.1), rgba(255,255,255,0) 40%), linear-gradient(136deg, #242831 0%, #10141c 54%, #06080d 100%)",
    borderColor: "rgba(255,255,255,0.24)",
    shadow: "0 12px 24px rgba(0,0,0,0.68), 0 4px 10px rgba(0,0,0,0.48)",
    textColor: "#f0f2f6",
  },
  mercadopago: {
    background:
      "linear-gradient(136deg, #263047 0%, #1f293e 55%, #1b2335 100%)",
    borderColor: "rgba(177,194,231,0.38)",
    shadow: "0 12px 24px rgba(9,16,34,0.64), 0 4px 10px rgba(0,0,0,0.42)",
    textColor: "#f1f5ff",
  },
  btg: {
    background:
      "radial-gradient(90% 130% at 100% 50%, rgba(64,156,255,0.24), rgba(64,156,255,0) 55%), linear-gradient(136deg, #022a4d 0%, #01386a 48%, #022146 100%)",
    borderColor: "rgba(160,208,255,0.48)",
    shadow: "0 12px 24px rgba(1,29,62,0.62), 0 4px 10px rgba(0,0,0,0.42)",
    textColor: "#eaf3ff",
  },
  xp: {
    background:
      "repeating-linear-gradient(95deg, rgba(255,255,255,0.1) 0px, rgba(255,255,255,0.1) 1px, transparent 1px, transparent 8px), linear-gradient(136deg, #5a5f68 0%, #262b33 56%, #10141a 100%)",
    borderColor: "rgba(255,255,255,0.24)",
    shadow: "0 12px 24px rgba(0,0,0,0.7), 0 4px 10px rgba(0,0,0,0.48)",
    textColor: "#f7f8fa",
  },
  santander: {
    background:
      "linear-gradient(136deg, #111111 0%, #050505 52%, #000000 100%)",
    borderColor: "rgba(255,255,255,0.18)",
    shadow: "0 12px 24px rgba(0,0,0,0.74), 0 4px 10px rgba(0,0,0,0.5)",
    textColor: "#d7dce5",
  },
  caixa: {
    background:
      "linear-gradient(136deg, #0a5da8 0%, #004793 52%, #01336f 100%)",
    borderColor: "rgba(255,165,78,0.45)",
    shadow: "0 12px 24px rgba(3,39,84,0.62), 0 4px 10px rgba(0,0,0,0.42)",
    textColor: "#f6f9ff",
  },
  c6bank: {
    background:
      "linear-gradient(136deg, #111214 0%, #07090c 52%, #020305 100%)",
    borderColor: "rgba(255,255,255,0.16)",
    shadow: "0 12px 24px rgba(0,0,0,0.74), 0 4px 10px rgba(0,0,0,0.52)",
    textColor: "#d7dce5",
  },
  wise: {
    background:
      "linear-gradient(136deg, #9dee7f 0%, #68d85d 52%, #4fcf58 100%)",
    borderColor: "rgba(255,255,255,0.18)",
    shadow: "0 12px 24px rgba(24,88,36,0.5), 0 4px 10px rgba(0,0,0,0.35)",
    textColor: "#0e141f",
  },
  nomad: {
    background:
      "linear-gradient(136deg, #f2d85c 0%, #e0c347 52%, #cfb13e 100%)",
    borderColor: "rgba(255,255,255,0.18)",
    shadow: "0 12px 24px rgba(89,74,15,0.46), 0 4px 10px rgba(0,0,0,0.35)",
    textColor: "#141414",
  },
  bancodobrasil: {
    background:
      "radial-gradient(110% 130% at 0% 100%, rgba(255,221,87,0.32), rgba(255,221,87,0) 55%), linear-gradient(136deg, #0a3274 0%, #08285f 52%, #061d49 100%)",
    borderColor: "rgba(255,220,102,0.45)",
    shadow: "0 12px 24px rgba(4,25,66,0.64), 0 4px 10px rgba(0,0,0,0.42)",
    textColor: "#f4d34e",
  },
};

function Contactless({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M8 8c2.8 2.7 2.8 7.3 0 10" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 6.5c3.9 3.8 3.9 9.2 0 13" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M16 5c5 5 5 11 0 16" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CardChip() {
  return (
    <div className="rounded-md border border-white/45 bg-white/85 p-[2px] shadow-[0_2px_4px_rgba(0,0,0,0.34)]">
      <div className="relative h-[24px] w-[34px] rounded-[4px] border border-slate-500/55 bg-gradient-to-br from-slate-100 to-slate-300">
        <div className="absolute left-0 top-1/2 h-[1px] w-full -translate-y-1/2 bg-slate-500/70" />
        <div className="absolute left-1/3 top-0 h-full w-[1px] bg-slate-500/65" />
        <div className="absolute left-2/3 top-0 h-full w-[1px] bg-slate-500/65" />
      </div>
    </div>
  );
}

function MastercardMark({ textColor }: { textColor: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="relative h-7 w-[46px]">
        <span className="absolute left-0 top-1 h-5 w-5 rounded-full bg-[#ea001b]" />
        <span className="absolute right-0 top-1 h-5 w-5 rounded-full bg-[#ffb700]" />
        <span className="absolute left-3 top-1 h-5 w-5 rounded-full bg-[#ff7b00]/85 mix-blend-multiply" />
      </div>
      <p className="text-[10px] font-semibold leading-none tracking-tight" style={{ color: textColor }}>
        mastercard
      </p>
    </div>
  );
}

function VisaMark({ textColor, vertical = false }: { textColor: string; vertical?: boolean }) {
  if (!vertical) {
    return <p className="text-[34px] font-black italic leading-none tracking-tight" style={{ color: textColor }}>VISA</p>;
  }
  return (
    <p
      className="[writing-mode:vertical-rl] rotate-180 text-[24px] font-black italic leading-none tracking-tight"
      style={{ color: textColor }}
    >
      VISA
    </p>
  );
}

function MercadoPagoBadge({ textColor }: { textColor: string }) {
  return (
    <div className="flex items-center justify-center rounded-full border border-white/75 px-2 py-[2px]">
      <svg width="26" height="14" viewBox="0 0 26 14" fill="none" aria-hidden="true">
        <path d="M2 7c3-4 6-4 9 0M24 7c-3 4-6 4-9 0" stroke={textColor} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M9 7h8" stroke={textColor} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function Bank3DCardVisual({ bankKey }: Bank3DCardVisualProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const pressedRef = useRef(false);
  const hoveredRef = useRef(false);
  const theme = CARD_THEME[bankKey];
  const cardImage = CARD_IMAGE_MAP[bankKey];

  if (cardImage) {
    return <Image3DCard src={cardImage} alt={`Cartao ${bankKey}`} />;
  }

  const getScale = () => {
    if (pressedRef.current) return 1.006;
    if (hoveredRef.current) return 1.016;
    return 1;
  };

  const applyTilt = (xPercent: number, yPercent: number) => {
    const card = cardRef.current;
    if (!card) return;
    const rx = ((50 - yPercent) / 50) * 7;
    const ry = ((xPercent - 50) / 50) * 9;
    const scale = getScale();

    card.style.transform = `perspective(1200px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${scale})`;
    card.style.setProperty("--mx", `${xPercent.toFixed(2)}%`);
    card.style.setProperty("--my", `${yPercent.toFixed(2)}%`);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    applyTilt(x, y);
  };

  const handlePointerLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    pressedRef.current = false;
    hoveredRef.current = false;
    card.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg) scale(1)";
    card.style.setProperty("--mx", "26%");
    card.style.setProperty("--my", "20%");
  };

  const handlePointerEnter = () => {
    hoveredRef.current = true;
    applyTilt(54, 46);
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
        onPointerEnter={handlePointerEnter}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerLeave}
        className={CARD_VISUAL_FRAME_CLASS}
        style={{
          "--mx": "26%",
          "--my": "20%",
          background: theme.background,
          borderColor: theme.borderColor,
          boxShadow: theme.shadow,
          filter: "saturate(0.9) brightness(0.92)",
          transform: "perspective(1200px) rotateX(0deg) rotateY(0deg) scale(1)",
        } as React.CSSProperties}
      >
        <div className="pointer-events-none absolute inset-0 [transform:translateZ(18px)] bg-[linear-gradient(152deg,rgba(93,55,152,0.28),rgba(14,9,30,0.42)_45%,rgba(6,5,19,0.72))] mix-blend-multiply" />
        <div
          className="pointer-events-none absolute inset-0 opacity-35 [transform:translateZ(62px)]"
          style={{
            background:
              "radial-gradient(100% 120% at var(--mx) var(--my), rgba(255,255,255,0.24), rgba(255,255,255,0) 46%)",
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,0.16),rgba(255,255,255,0)_34%,rgba(0,0,0,0.22))] [transform:translateZ(24px)]" />

        {bankKey === "nubank" ? (
          <>
            <div className="absolute left-4 top-3">
              <p className="text-[40px] font-black leading-none" style={{ color: theme.textColor }}>nu</p>
              <p className="text-sm font-medium leading-none" style={{ color: theme.textColor }}>Ultravioleta</p>
            </div>
            <div className="absolute right-4 top-3 opacity-90">
              <Contactless color={theme.textColor} />
            </div>
            <div className="absolute right-6 top-[54px]">
              <CardChip />
            </div>
            <div className="absolute bottom-2 right-4">
              <MastercardMark textColor={theme.textColor} />
            </div>
          </>
        ) : null}

        {bankKey === "inter" ? (
          <>
            <div className="absolute right-4 top-3 text-right">
              <p className="text-[38px] font-black leading-none" style={{ color: theme.textColor }}>inter</p>
              <p className="text-sm font-light leading-none" style={{ color: theme.textColor }}>prime</p>
            </div>
            <div className="absolute left-4 top-[54px]">
              <CardChip />
            </div>
            <div className="absolute left-4 bottom-2 opacity-75">
              <Contactless color="#7f8593" />
            </div>
            <div className="absolute bottom-2 right-4">
              <MastercardMark textColor="#aeb4bf" />
            </div>
          </>
        ) : null}

        {bankKey === "bradesco" ? (
          <>
            <div className="absolute left-4 top-3 flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full border-2 border-slate-300/80 border-t-transparent rotate-45" />
              <p className="text-[22px] font-bold leading-none" style={{ color: theme.textColor }}>bradesco</p>
            </div>
            <div className="absolute right-4 top-3 opacity-90">
              <Contactless color={theme.textColor} />
            </div>
            <div className="absolute left-4 top-[54px]">
              <CardChip />
            </div>
            <div className="absolute left-[164px] top-[54px] h-[34px] w-[34px] rounded-[3px] border border-slate-300/30 bg-[repeating-radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.24)_0_1px,transparent_1px_4px)] opacity-70" />
            <p className="absolute left-[156px] top-[94px] text-[10px] tracking-[0.42em] text-slate-300/75">
              AETERNUM
            </p>
            <div className="absolute bottom-2 right-4">
              <VisaMark textColor={theme.textColor} />
            </div>
          </>
        ) : null}

        {bankKey === "mercadopago" ? (
          <>
            <p className="absolute left-14 top-1/2 -translate-y-1/2 text-[38px] font-black leading-[0.8] text-slate-100/10">
              MERCADO
              <br />
              PAGO
            </p>
            <div className="absolute left-4 top-3 opacity-90">
              <Contactless color={theme.textColor} />
            </div>
            <div className="absolute left-4 top-[54px]">
              <CardChip />
            </div>
            <div className="absolute right-4 top-3">
              <VisaMark textColor={theme.textColor} vertical />
            </div>
            <div className="absolute bottom-2 right-4">
              <MercadoPagoBadge textColor={theme.textColor} />
            </div>
          </>
        ) : null}

        {bankKey === "btg" ? (
          <>
            <div className="absolute right-3 top-1/2 h-[140px] w-[140px] -translate-y-1/2 rounded-full bg-sky-300/10" />
            <div className="absolute right-5 top-1/2 -translate-y-1/2 text-right">
              <p className="text-[32px] font-semibold leading-none" style={{ color: theme.textColor }}>
                btg<span className="ml-1 font-normal">pactual</span>
              </p>
            </div>
            <div className="absolute left-4 top-[54px]">
              <CardChip />
            </div>
            <div className="absolute left-[52px] top-[56px] opacity-70">
              <Contactless color="#8da8cf" />
            </div>
            <div className="absolute bottom-2 right-4">
              <MastercardMark textColor={theme.textColor} />
            </div>
          </>
        ) : null}

        {bankKey === "xp" ? (
          <>
            <div className="absolute right-4 top-3 rounded-md bg-amber-300/90 px-2 py-1 text-sm font-black leading-none text-black">
              XP
            </div>
            <div className="absolute left-4 top-[54px]">
              <CardChip />
            </div>
            <div className="absolute left-[52px] top-[56px] opacity-70">
              <Contactless color="#c9ced7" />
            </div>
            <div className="absolute bottom-2 right-4">
              <VisaMark textColor={theme.textColor} />
            </div>
          </>
        ) : null}

        {bankKey === "caixa" ? (
          <>
            <div className="absolute left-4 top-3 flex items-center gap-2">
              <div className="relative h-6 w-6 rounded-sm bg-[#005ca9] shadow-[0_2px_6px_rgba(0,0,0,0.35)]">
                <span className="absolute left-1 top-1 h-1.5 w-4 rotate-45 bg-[#f4a100]" />
                <span className="absolute left-1 top-3 h-1.5 w-4 -rotate-45 bg-white" />
              </div>
              <p className="text-[22px] font-black leading-none tracking-tight text-[#f4a100]">caixa</p>
            </div>
            <div className="absolute right-4 top-3 opacity-90">
              <Contactless color={theme.textColor} />
            </div>
            <div className="absolute left-4 top-[54px]">
              <CardChip />
            </div>
            <p className="absolute left-4 bottom-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">
              economica federal
            </p>
            <div className="absolute bottom-2 right-4">
              <VisaMark textColor={theme.textColor} />
            </div>
          </>
        ) : null}

        {bankKey === "bancodobrasil" ? (
          <>
            <div className="absolute left-4 top-3 flex items-center gap-2">
              <div className="relative h-[24px] w-[24px]">
                <span className="absolute left-1/2 top-0 h-[24px] w-[10px] -translate-x-1/2 rotate-45 rounded-sm border-2 border-[#f4d34e]" />
                <span className="absolute left-1/2 top-0 h-[24px] w-[10px] -translate-x-1/2 -rotate-45 rounded-sm border-2 border-[#f4d34e]" />
              </div>
              <p className="text-[22px] font-black leading-none tracking-tight" style={{ color: theme.textColor }}>
                bb
              </p>
            </div>
            <div className="absolute right-4 top-3 opacity-90">
              <Contactless color={theme.textColor} />
            </div>
            <div className="absolute left-4 top-[54px]">
              <CardChip />
            </div>
            <p className="absolute left-4 bottom-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f4d34e]/90">
              Banco do Brasil
            </p>
            <div className="absolute bottom-2 right-4">
              <VisaMark textColor={theme.textColor} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
