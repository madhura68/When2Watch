import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() { return [
    { source: "/volgen", destination: "/following", permanent: false },
    { source: "/uitnodiging", destination: "/invitation", permanent: false },
    { source: "/beheer/gebruikers", destination: "/admin/users", permanent: false },
    { source: "/beheer/series", destination: "/admin/series", permanent: false },
  ]; },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "private, no-store" },
    ] }];
  },
};
export default nextConfig;
