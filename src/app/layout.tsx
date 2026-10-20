import type { Metadata, Viewport } from "next";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "VeriSpace", template: "%s | VeriSpace" },
  description: "A tamper-evident record of every turnover and stay, room by room.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#0B0C10", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
