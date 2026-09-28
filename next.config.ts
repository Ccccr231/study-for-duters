import type { NextConfig } from "next";

// 上线基线安全头。CSP 先不加：Next 内联脚本/样式较多，严格 CSP 容易误伤，
// 等上线后按实际报错再逐步收紧（见 DEPLOY.md 遗留项）。
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
