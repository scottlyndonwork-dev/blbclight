/** Per-device text size preference, applied as `data-text-size` on <html>. */
export const TEXT_SIZES = [
  { value: "normal", label: "Normal" },
  { value: "large", label: "Large" },
  { value: "xlarge", label: "Extra large" },
] as const;

export type TextSize = (typeof TEXT_SIZES)[number]["value"];

export const TEXT_SIZE_KEY = "light-text-size";

/** Runs before first paint (inlined in the root layout) so the page never jumps size. */
export const textSizeBootScript = `try{var s=localStorage.getItem("${TEXT_SIZE_KEY}");if(s==="large"||s==="xlarge")document.documentElement.dataset.textSize=s}catch(e){}`;

export function readTextSize(): TextSize {
  if (typeof document === "undefined") return "normal";
  const value = document.documentElement.dataset.textSize;
  return value === "large" || value === "xlarge" ? value : "normal";
}

export function applyTextSize(size: TextSize) {
  if (size === "normal") delete document.documentElement.dataset.textSize;
  else document.documentElement.dataset.textSize = size;
  try {
    localStorage.setItem(TEXT_SIZE_KEY, size);
  } catch {
    // Private browsing or blocked storage: the choice still applies to this page.
  }
}
