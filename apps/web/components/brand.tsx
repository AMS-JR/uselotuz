import Image from "next/image";
import Link from "next/link";
import { Comfortaa } from "next/font/google";

const comfortaa = Comfortaa({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export function Brand() {
  return (
    <Link
      href="/"
      aria-label="Lotuz home"
      className="inline-flex min-h-11 shrink-0 items-center gap-0 text-foreground"
    >
      <Image
        src="/brand/logo/lotus.svg"
        alt=""
        width={44}
        height={44}
        unoptimized
        className="size-10 shrink-0 sm:size-11"
      />
      <span
        className={`${comfortaa.className} text-[22px] leading-none font-normal tracking-[-0.03em] sm:text-[26px]`}
      >
        lotuz
      </span>
    </Link>
  );
}
