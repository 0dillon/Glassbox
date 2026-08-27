import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";

import "./globals.css";

import { ConfigBanner } from "@/components/config-banner";
import { Rail } from "@/components/rail";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getConfig, shortAccount } from "@/lib/config";

/**
 * Fonts are loaded with display: "swap". If Google Fonts is unreachable at
 * build time the declared fallback stacks in globals.css carry the interface.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Glassbox",
  description: "Shared memory for a team that keeps losing its own decisions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Reading config in the layout is what makes the missing-key notice appear on
  // every route. It must never throw.
  const config = getConfig();

  return (
    <html lang="en" className={`${archivo.variable} ${jetbrains.variable}`}>
      <body>
        <TooltipProvider>
          <div className="flex min-h-screen">
            <Rail
              accountLabel={shortAccount(config.accountId)}
              accountId={config.accountId}
            />
            <div className="min-w-0 flex-1">
              <ConfigBanner
                missing={config.missing}
                notices={config.notices}
              />
              <main className="mx-auto w-full max-w-[1100px] p-[var(--s-7)]">
                {children}
              </main>
            </div>
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}
