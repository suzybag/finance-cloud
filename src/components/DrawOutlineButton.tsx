import type { ButtonHTMLAttributes, ReactNode } from "react";

type DrawOutlineButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  lineClassName?: string;
  contentClassName?: string;
};

export function DrawOutlineButton({
  children,
  className = "",
  lineClassName = "bg-indigo-300",
  contentClassName = "",
  ...rest
}: DrawOutlineButtonProps) {
  return (
    <button
      {...rest}
      className={`group relative overflow-hidden transition-colors duration-[400ms] disabled:pointer-events-none disabled:opacity-60 ${className}`}
    >
      <span className={`relative z-10 inline-flex items-center gap-2 ${contentClassName}`}>
        {children}
      </span>

      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-0 h-[2px] w-0 transition-all duration-100 group-hover:w-full ${lineClassName}`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute right-0 top-0 h-0 w-[2px] transition-all delay-100 duration-100 group-hover:h-full ${lineClassName}`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-0 right-0 h-[2px] w-0 transition-all delay-200 duration-100 group-hover:w-full ${lineClassName}`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-0 left-0 h-0 w-[2px] transition-all delay-300 duration-100 group-hover:h-full ${lineClassName}`}
      />
    </button>
  );
}
