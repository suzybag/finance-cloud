"use client";

import { Image3DCard } from "@/components/Image3DCard";

export function PicPayCardVisual() {
  return (
    <Image3DCard
      src="/cards/picpay-black.png"
      alt="Cartao PicPay"
      className="border-emerald-300/35 bg-[#050807] shadow-[0_12px_24px_rgba(0,0,0,0.4),0_4px_10px_rgba(0,0,0,0.26)]"
    />
  );
}
