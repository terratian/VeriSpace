export const field =
  "w-full rounded-[10px] border border-edge bg-obsidian px-3 py-2.5 text-base text-white placeholder:text-mute/70 transition-colors focus-visible:border-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/25 disabled:opacity-60 sm:text-[15px]";

export const fieldLabel = "mb-1.5 block text-[13px] font-medium text-ash";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-mint font-semibold text-obsidian hover:bg-[#8afaf3]",
  secondary: "border border-edge bg-slate-brand/60 font-medium text-white hover:border-mint/50 hover:bg-slate-brand",
  ghost: "font-medium text-ash hover:bg-white/5 hover:text-white",
  danger: "border border-flag/40 font-medium text-flag hover:bg-flag/10",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-10 gap-2 rounded-[10px] px-4 text-sm",
  lg: "h-12 gap-2.5 rounded-xl px-5 text-base",
};

/** Class string for buttons and for links that should look like buttons. */
export function button(variant: ButtonVariant = "secondary", size: ButtonSize = "md"): string {
  return `inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]}`;
}

export type Tone = "neutral" | "mint" | "amber" | "red" | "sky";

export const toneClasses: Record<Tone, string> = {
  neutral: "border-edge text-ash",
  mint: "border-mint/40 bg-mint/10 text-mint",
  amber: "border-amber/40 bg-amber/10 text-amber",
  red: "border-flag/40 bg-flag/10 text-flag",
  sky: "border-sky/40 bg-sky/10 text-sky",
};
