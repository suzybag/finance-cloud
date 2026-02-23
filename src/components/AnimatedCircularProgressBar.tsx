"use client";

import { useEffect, useMemo, useState } from "react";

type AnimatedCircularProgressBarProps = {
  value: number;
  min?: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  gaugePrimaryColor?: string;
  gaugeSecondaryColor?: string;
  className?: string;
  valueClassName?: string;
  showValueLabel?: boolean;
  suffix?: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function AnimatedCircularProgressBar({
  value,
  min = 0,
  max = 100,
  size = 132,
  strokeWidth = 12,
  gaugePrimaryColor = "rgb(79 70 229)",
  gaugeSecondaryColor = "rgba(148, 163, 184, 0.25)",
  className = "",
  valueClassName = "",
  showValueLabel = true,
  suffix = "%",
}: AnimatedCircularProgressBarProps) {
  const safeRange = Math.max(1, max - min);
  const clampedValue = clamp(value, min, max);
  const normalizedPercent = ((clampedValue - min) / safeRange) * 100;
  const [animatedPercent, setAnimatedPercent] = useState(normalizedPercent);

  useEffect(() => {
    setAnimatedPercent(normalizedPercent);
  }, [normalizedPercent]);

  const radius = useMemo(() => (size - strokeWidth) / 2, [size, strokeWidth]);
  const circumference = useMemo(() => 2 * Math.PI * radius, [radius]);
  const dashOffset = useMemo(
    () => circumference - ((animatedPercent / 100) * circumference),
    [animatedPercent, circumference],
  );
  const formattedValue = `${clampedValue.toFixed(1).replace(".", ",")}${suffix}`;

  return (
    <div className={`relative inline-grid place-items-center ${className}`}>
      <svg width={size} height={size} aria-hidden="true">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={gaugeSecondaryColor}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={gaugePrimaryColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{
              transition: "stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </g>
      </svg>
      {showValueLabel ? (
        <span className={`absolute text-lg font-black tracking-tight text-white ${valueClassName}`}>
          {formattedValue}
        </span>
      ) : null}
    </div>
  );
}
