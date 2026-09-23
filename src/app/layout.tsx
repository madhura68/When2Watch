import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "When2Watch", description: "Je series, in je agenda.", robots: { index: false, follow: false } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="nl"><body><main>{children}</main><footer>When2Watch · Persoonlijke serieagenda</footer></body></html>;
}
