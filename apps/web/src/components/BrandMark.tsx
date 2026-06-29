import Image from "next/image";

type BrandMarkProps = {
  size?: number;
  className?: string;
};

export function BrandMark({ size = 132, className }: BrandMarkProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-full shadow-rf-soft ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <Image
        src="/brand/app-icon.png"
        alt="RaSi Fiters logo"
        fill
        sizes={`${size}px`}
        className="object-cover"
        priority
      />
    </div>
  );
}
