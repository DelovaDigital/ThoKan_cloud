import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { PWARegister } from "@/components/pwa-register";
import { CapacitorProviders } from "@/components/capacitor-providers";
import "./globals.css";

const sans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ThoKan Cloud",
  description: "Self-hosted cloudopslagplatform",
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
    <html lang="nl" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable}`}>
        <PWARegister />
        <CapacitorProviders />
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!bg-card !border-border !text-fg !rounded-xl !shadow-md",
              description: "!text-muted",
              success: "!text-success",
              error: "!text-destructive",
            },
          }}
        />
      </body>
    </html>
  );
}
