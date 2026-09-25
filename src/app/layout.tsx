import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "When2Watch", description: "Je series, in je agenda.", robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "When2Watch", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" }, { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};
export const viewport: Viewport = { themeColor: "#176b60" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="nl"><body><main>{children}</main><footer>When2Watch · Persoonlijke serieagenda · <a href="/privacy">Privacy</a></footer></body></html>;
}
