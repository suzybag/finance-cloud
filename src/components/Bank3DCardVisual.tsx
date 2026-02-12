"use client";

import { useRef } from "react";

export type StyledBankKey =
  | "nubank"
  | "bradesco"
  | "inter"
  | "mercadopago"
  | "btg"
  | "xp"
  | "santander"
  | "bancodobrasil"
  | "picpay"
  | "wise"
  | "c6bank";

type Bank3DCardVisualProps = {
  bankKey: StyledBankKey;
};

type CardPhotoTheme = {
  src: string;
  objectPosition?: string;
  overlay?: string;
};

const CARD_PHOTO_MAP: Record<StyledBankKey, CardPhotoTheme> = {
  nubank: {
    src: "/cards/nubank-ultravioleta.webp",
    objectPosition: "center",
    overlay: "rgba(0,0,0,0.22)",
  },
  bradesco: {
    src: "/cards/bradesco-aeternum.webp",
    objectPosition: "center",
    overlay: "rgba(0,0,0,0.34)",
  },
  inter: {
    src: "/cards/inter-card.webp",
    objectPosition: "center",
    overlay: "rgba(0,0,0,0.32)",
  },
  mercadopago: {
    src: "/cards/mercadopago-card.png",
    objectPosition: "center",
    overlay: "rgba(0,0,0,0.30)",
  },
  btg: {
    src: "/cards/btg-black.png",
    objectPosition: "center",
    overlay: "rgba(0,0,0,0.34)",
  },
  xp: {
    src: "/cards/xp-infinite.webp",
    objectPosition: "center",
    overlay: "rgba(0,0,0,0.32)",
  },
  santander: {
    src: "/cards/santander-unlimited.png",
    objectPosition: "center",
    overlay: "rgba(0,0,0,0.30)",
  },
  bancodobrasil: {
    src: "/cards/bancodobrasil-ourocard.png",
    objectPosition: "center",
    overlay: "rgba(0,0,0,0.16)",
  },
  picpay: {
    src: "/cards/picpay-platinum.png",
    objectPosition: "center",
    overlay: "rgba(0,0,0,0.24)",
  },
  wise: {
    src: "/cards/wise-green.webp",
    objectPosition: "center",
    overlay: "rgba(0,0,0,0.20)",
  },
  c6bank: {
    src: "/cards/c6-carbon.webp",
    objectPosition: "center",
    overlay: "rgba(0,0,0,0.33)",
  },
};

export function Bank3DCardVisual({ bankKey }: Bank3DCardVisualProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const pressedRef = useRef(false);
  const cardPhoto = CARD_PHOTO_MAP[bankKey];

  const applyTilt = (xPercent: number, yPercent: number) => {
    const card = cardRef.current;
    if (!card) return;

    const rx = ((50 - yPercent) / 50) * 6.5;
    const ry = ((xPercent - 50) / 50) * 8.5;
    const scale = pressedRef.current ? 0.988 : 1;

    card.style.transform = `perspective(1200px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${scale})`;
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
    card.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg) scale(1)";
    card.style.setProperty("--mx", "25%");
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
    <div className="mx-auto w-full max-w-[430px] [perspective:1200px]">
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        className="relative h-[142px] w-full overflow-hidden rounded-xl border border-white/20 transition-transform duration-150 ease-out [transform-style:preserve-3d]"
        style={{
          "--mx": "25%",
          "--my": "20%",
          boxShadow: "0 12px 24px rgba(0,0,0,0.54), 0 4px 10px rgba(0,0,0,0.4)",
          transform: "perspective(1200px) rotateX(0deg) rotateY(0deg) scale(1)",
        } as React.CSSProperties}
      >
        <img
          src={cardPhoto.src}
          alt={`Cartao ${bankKey}`}
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            objectPosition: cardPhoto.objectPosition ?? "center",
            filter: "brightness(0.78) saturate(1.45) contrast(1.08)",
          }}
          draggable={false}
        />

        <div className="pointer-events-none absolute inset-0" style={{ background: cardPhoto.overlay ?? "rgba(0,0,0,0.24)" }} />

        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(110% 120% at var(--mx) var(--my), rgba(255,255,255,0.16), rgba(255,255,255,0) 46%)",
          }}
        />
      </div>
    </div>
  );
}

