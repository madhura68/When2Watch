import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Vis type: Public Sans for text, Source Serif 4 for headlines; vendored in ./fonts (SIL OFL).
const sans = localFont({ src: "./fonts/PublicSans-latin.woff2", weight: "400 600", variable: "--font-sans", display: "swap" });
const serif = localFont({ src: "./fonts/SourceSerif4-latin.woff2", weight: "500", variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: "When2Watch", description: "Your series, in your calendar.", robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "When2Watch", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" }, { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};
export const viewport: Viewport = { themeColor: "#fdf9f4" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const contact = process.env.W2W_PRIVACY_CONTACT?.trim();
  return <html lang="en" className={`${sans.variable} ${serif.variable}`}><body><main>{children}</main><footer>When2Watch · Your series, in your calendar · <a href="/privacy">Privacy</a>{contact && <> · <a href={`mailto:${contact}`}>{contact}</a></>}</footer></body></html>;
}
