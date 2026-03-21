/**
 * SpeechBridge mark — file lives in `public/speechbridge-logo.png`.
 */
export function BrandLogo({ variant = "md", className = "" }) {
  const sizeClass =
    variant === "sm"
      ? "brand-logo--sm"
      : variant === "nav"
        ? "brand-logo--nav"
        : variant === "hero"
          ? "brand-logo--hero"
          : "brand-logo--md";

  return (
    <img
      src="/speechbridge-logo.png"
      alt="SpeechBridge"
      className={`brand-logo ${sizeClass} ${className}`.trim()}
      decoding="async"
      draggable={false}
    />
  );
}
