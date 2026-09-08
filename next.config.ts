import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The public events route used to live at /markets — keep old links
      // (already shared, bookmarked, or indexed) working.
      { source: "/markets", destination: "/events", permanent: true },
      { source: "/markets/:slug", destination: "/events/:slug", permanent: true },
    ];
  },
};

export default nextConfig;
