import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 제출할 때 작성 기록(edit_log)을 함께 보낸다. 오래 작성하면 1MB(기본값)를 넘을 수 있다.
      // Vercel 함수 요청 한도(4.5MB)보다 조금 작게 둔다.
      bodySizeLimit: "4mb",
    },
  },
  // 연습 모드: 서버에서 AI가 만든 참고 답안을 Pyodide로 돌려 확인한다 (src/lib/pyRunner.ts).
  // 파일 경로로 불러오므로 배포 묶음에 pyodide 파일을 함께 넣는다 (학생 화면의 서버 액션에서만 씀)
  outputFileTracingIncludes: {
    "/student": ["./node_modules/pyodide/**/*"],
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
