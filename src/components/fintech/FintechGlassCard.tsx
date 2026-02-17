import type { ReactNode } from "react";

type FintechGlassCardProps = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  as?: "section" | "article" | "div";
};

export function FintechGlassCard({
  children,
  className = "",
  hover = false,
  as = "section",
}: FintechGlassCardProps) {
  const Component = as;
  const classes = [
    "fintech-glass-card",
    hover ? "fintech-glass-card-hover" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <Component className={classes}>{children}</Component>;
}

