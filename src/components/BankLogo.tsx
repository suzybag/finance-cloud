import Image from "next/image";
import { getBankIconPath } from "@/lib/bankIcons";

type BankLogoProps = {
  bankName?: string | null;
  size?: number;
  className?: string;
};

export function BankLogo({ bankName, size = 30, className }: BankLogoProps) {
  const src = getBankIconPath(bankName);
  if (!src) return null;

  return (
    <Image
      src={src}
      alt={bankName || "Banco"}
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className ?? ""}`}
      style={{ width: size, height: size }}
    />
  );
}

