import { QRCodeSVG } from "qrcode.react";
import { EXPORT_QR_CONFIG } from "../config/exportQr";
import { getExportQrTarget } from "../utils/exportQr";

interface ExportQrCodeProps {
  pageUrl: string;
}

export default function ExportQrCode({ pageUrl }: ExportQrCodeProps) {
  const target = getExportQrTarget(pageUrl);

  return (
    <div
      data-export-qr-code="true"
      data-export-qr-target={target}
      aria-hidden="true"
      style={{
        width: `${EXPORT_QR_CONFIG.size}px`,
        height: `${EXPORT_QR_CONFIG.size}px`,
        flex: "0 0 auto",
        background: EXPORT_QR_CONFIG.background,
      }}
    >
      <QRCodeSVG
        value={target}
        size={EXPORT_QR_CONFIG.size}
        level={EXPORT_QR_CONFIG.errorCorrectionLevel}
        marginSize={EXPORT_QR_CONFIG.marginModules}
        bgColor={EXPORT_QR_CONFIG.background}
        fgColor={EXPORT_QR_CONFIG.foreground}
        boostLevel
        focusable="false"
        style={{ display: "block" }}
      />
    </div>
  );
}
