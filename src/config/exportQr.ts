export const EXPORT_QR_CONFIG = {
  size: 104,
  marginModules: 4,
  errorCorrectionLevel: "M",
  foreground: "#000000",
  background: "#ffffff",
  fiveMemory: {
    portrait: {
      fixedCardSize: 140,
      gap: 8,
    },
    story: {
      fixedCardSize: 218,
      gap: 14,
    },
  },
} as const;
