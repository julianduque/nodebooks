const palettes: Record<string, string[]> = {
  viridis: ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"],
  plasma: ["#0d0887", "#6a00a8", "#b12a90", "#e16462", "#fca636", "#f0f921"],
  magma: ["#000004", "#3b0f6f", "#8c2981", "#de4968", "#fe9f6d", "#fcfdbf"],
  inferno: ["#000004", "#2c105c", "#641a80", "#9c179e", "#ed7953", "#fcffa4"],
  turbo: ["#30123b", "#4146ad", "#2ba3d5", "#38d151", "#f9e721", "#f48a19"],
  grey: ["#111827", "#1f2937", "#374151", "#4b5563", "#9ca3af", "#e5e7eb"],
  custom: ["#134e4a", "#047857", "#22d3ee", "#fde68a", "#f97316", "#be123c"],
};

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace(/^#/, "");
  const int = Number.parseInt(
    normalized.length === 3 ? normalized.repeat(2) : normalized,
    16
  );
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  return [r, g, b];
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const rgbToHex = (rgb: [number, number, number]) => {
  const [r, g, b] = rgb.map((v) => Math.round(clamp(v, 0, 255)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
};

export const sampleColor = (scale: string, t: number) => {
  const colors = palettes[scale] ?? palettes.viridis;
  const stops = colors.length - 1;
  if (stops <= 0) return colors[0] ?? "#888";
  const clamped = clamp(t, 0, 1) * stops;
  const idx = Math.floor(clamped);
  const frac = clamped - idx;
  const from = hexToRgb(colors[idx] ?? colors[0]!);
  const to = hexToRgb(colors[idx + 1] ?? colors[idx]!);
  const blended: [number, number, number] = [
    from[0] + (to[0] - from[0]) * frac,
    from[1] + (to[1] - from[1]) * frac,
    from[2] + (to[2] - from[2]) * frac,
  ];
  return rgbToHex(blended);
};

export const sampleColorRgb = (scale: string, t: number) => {
  const hex = sampleColor(scale, t);
  const [r, g, b] = hexToRgb(hex);
  return [r / 255, g / 255, b / 255] as [number, number, number];
};

export const getPalette = (scale: string) =>
  palettes[scale] ?? palettes.viridis;
