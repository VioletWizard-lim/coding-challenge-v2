import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 제출할 때 작성 기록(edit_log)을 함께 보낸다. 오래 작성하면 1MB(기본값)를 넘을 수 있다.
      // Vercel 함수 요청 한도(4.5MB)보다 조금 작게 둔다.
      bodySizeLimit: "4mb",
    },
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
