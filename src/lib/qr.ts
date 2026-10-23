import QRCode from "qrcode";

/** A QR code as an image address. Always dark on white with a quiet border, so any phone camera reads it. */
export function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 2, width: 320, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
}
