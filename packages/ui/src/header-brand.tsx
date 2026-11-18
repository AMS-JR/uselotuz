export type HeaderBrandProps = {
  showName?: boolean;
  logoSrc: string;
  appName: string;
  accessibleText: string;
  logoWidth?: number;
  logoHeight?: number;
};

/** Presentation only: each application owns its logo, label, and dimensions. */
export function HeaderBrand({
  showName = true,
  logoSrc,
  appName,
  accessibleText,
  logoWidth = 44,
  logoHeight = 44,
}: HeaderBrandProps) {
  return (
    <span
      role="img"
      aria-label={accessibleText}
      className="inline-flex min-w-0 items-center gap-1"
    >
      {/* App-owned static branding needs no image optimizer or framework dependency. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc}
        alt=""
        width={logoWidth}
        height={logoHeight}
        style={{ maxWidth: logoWidth, maxHeight: logoHeight }}
        className="h-10 w-auto shrink-0 object-contain sm:h-11"
      />
      {showName && (
        <span
          aria-hidden="true"
          className="text-lg leading-none font-semibold tracking-tight text-foreground sm:text-xl"
        >
          {appName}
        </span>
      )}
    </span>
  );
}
