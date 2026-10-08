import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "When2Watch", description: "Your series, in your calendar.", robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "When2Watch", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" }, { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};
export const viewport: Viewport = { themeColor: "#176b60" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const contact = process.env.W2W_PRIVACY_CONTACT?.trim();
  return <html lang="en"><body><main>{children}</main><footer>When2Watch · Your series, in your calendar · <a href="/privacy">Privacy</a>{contact && <> · <a href={`mailto:${contact}`}>{contact}</a></>}</footer></body></html>;
}
