import { generateText } from "ai";
import { PARSE_FAILURE_TEXT, parseLlmConfig } from "@/lib/ai/config";
import { chatModel } from "@/lib/ai/provider";
import { currentUser } from "@/lib/auth/session";

// 测试连接：只返回 true/false + 泛化原因，不回显上游错误原文（避免把 key 或内网地址带出来）。
// 必须登录：否则会成为一个未鉴权的「服务端代发请求」入口，可被用来盲探内网地址。
// 见 PLAN §4.3。
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, message: "未登录" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, message: "请求格式不对" }, { status: 400 });
  }

  const parsed = parseLlmConfig((body as { config?: unknown })?.config);
  if (!parsed.ok) {
    return Response.json({ ok: false, reason: parsed.reason, message: PARSE_FAILURE_TEXT[parsed.reason] });
  }

  try {
    await generateText({
      model: chatModel(parsed.config),
      prompt: "hi",
      maxOutputTokens: 1,
      // 别让重试把失败拖太久
      maxRetries: 0,
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({
      ok: false,
      reason: "upstream_error",
      message: "连不上：检查 Base URL、API Key 和模型名是否匹配",
    });
  }
}
