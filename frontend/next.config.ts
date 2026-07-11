import type { NextConfig } from "next";

// Route API calls to Supabase Edge Functions (no Python backend needed)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wamljmirzqviipsomjyu.supabase.co";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${SUPABASE_URL}/functions/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
