import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "RaveCulture",
  description: "Base-native onchain culture platform",
};

/**
 * Root layout — providers mounted here once, never remounted.
 * Wallet state is lifted to root so all pages share connection state.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
