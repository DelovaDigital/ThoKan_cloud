import type { Metadata } from "next";
import { PWARegister } from "@/components/pwa-register";
import { CapacitorProviders } from "@/components/capacitor-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "ThoKan Cloud",
  description: "Self-hosted cloud storage platform",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/Logo.png", type: "image/png" }],
    apple: [{ url: "/Logo.png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ThoKan Cloud",
  },
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PWARegister />
        <CapacitorProviders />
        {children}
      </body>
    </html>
  );
}
