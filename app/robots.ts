import type { MetadataRoute } from "next";

// 公开页（落地/登录/注册）允许收录；登录后的功能页与 API 全部 disallow。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/$", "/login", "/register"],
      disallow: ["/today", "/plans", "/focus", "/checkin", "/knowledge", "/chat", "/reports", "/settings", "/api/"],
    },
  };
}
