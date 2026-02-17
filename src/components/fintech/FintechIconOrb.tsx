type FintechIconOrbProps = {
  src: string;
  alt: string;
  className?: string;
  size?: number;
  imageSize?: number;
  fallbackSrc?: string;
};

export function FintechIconOrb({
  src,
  alt,
  className = "",
  size = 52,
  imageSize = 30,
  fallbackSrc = "/icons/default.png",
}: FintechIconOrbProps) {
  return (
    <span
      className={`fintech-icon-orb ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="fintech-icon-img"
        style={{ width: imageSize, height: imageSize }}
        loading="lazy"
        onError={(event) => {
          event.currentTarget.src = fallbackSrc;
        }}
      />
    </span>
  );
}

