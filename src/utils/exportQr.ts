export function getExportQrTarget(pageUrl: string) {
  const url = new URL(pageUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Export QR target must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Export QR target must not contain credentials");
  }
  if (url.search || url.hash) {
    throw new Error("Export QR target must not contain query or hash state");
  }

  return url.toString();
}

export function isExportQrTarget(value: unknown): value is string {
  if (typeof value !== "string") return false;

  try {
    return getExportQrTarget(value) === value;
  } catch {
    return false;
  }
}
