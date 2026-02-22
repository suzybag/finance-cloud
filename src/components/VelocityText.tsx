"use client";

import { motion, useScroll, useSpring, useTransform, useVelocity } from "framer-motion";
import { useRef } from "react";

type VelocityTextProps = {
  text: string;
  travel?: number;
  heightClassName?: string;
  className?: string;
  textClassName?: string;
};

export function VelocityText({
  text,
  travel = -1800,
  heightClassName = "h-[260vh]",
  className = "",
  textClassName = "",
}: VelocityTextProps) {
  const targetRef = useRef<HTMLElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end start"],
  });

  const scrollVelocity = useVelocity(scrollYProgress);
  const skewXRaw = useTransform(scrollVelocity, [-0.5, 0.5], ["35deg", "-35deg"]);
  const skewX = useSpring(skewXRaw, { mass: 3, stiffness: 400, damping: 50 });

  const xRaw = useTransform(scrollYProgress, [0, 1], [0, travel]);
  const x = useSpring(xRaw, { mass: 3, stiffness: 400, damping: 50 });

  return (
    <section
      ref={targetRef}
      className={`relative overflow-hidden rounded-3xl border border-white/10 bg-[#07090f] text-neutral-100 ${heightClassName} ${className}`}
    >
      <div className="sticky top-0 flex h-screen items-center overflow-hidden bg-[radial-gradient(circle_at_20%_20%,rgba(148,163,184,0.16),transparent_42%),radial-gradient(circle_at_80%_75%,rgba(30,41,59,0.4),transparent_45%),linear-gradient(130deg,#05070d,#0b0f17)]">
        <motion.p
          style={{ skewX, x }}
          className={`origin-bottom-left whitespace-nowrap px-5 text-4xl font-black uppercase leading-[0.86] tracking-[-0.02em] text-zinc-100/90 md:px-10 md:text-6xl ${textClassName}`}
        >
          {text}
        </motion.p>
      </div>
    </section>
  );
}
