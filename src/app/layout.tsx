import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/toaster";
import { PublishedListingToast } from "@/components/marketplace/published-listing-toast";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pokemon Marketplace",
  description: "Marketplace C2C de cartes Pokemon",
  manifest: "/manifest.webmanifest",
  applicationName: "Pokemon Marketplace",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pokemon Marketplace",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <ServiceWorkerRegister />
          <InstallPrompt />
          <AppShell>{children}</AppShell>
          <PublishedListingToast />
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
