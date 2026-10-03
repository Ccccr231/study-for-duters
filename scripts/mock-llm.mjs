// 本地 OpenAI 兼容假服务，用于在**没有真实 API Key** 的情况下验证 AI 链路是否接通。
//
// 为什么需要它：平台的约定是「不预置任何密钥」，所以 AI 相关功能（连小理对话、
// 知识库问答、报告生成）在验收里一直是空白的。但代码只要求 Base URL 是 http(s) 开头
// （见 lib/ai/config.ts，没有阻断本机地址），因此可以指到一个本地假服务上来打通链路。
//
// 它验证的是「接线」而不是「模型质量」：回复内容是确定性的、对被喂进来的上下文做回显，
// 所以断言可以精确到「待办标题」「资料原文」是否真的走到了模型面前。
//
// 用法：
//   node scripts/mock-llm.mjs            # 默认 http://127.0.0.1:8787/v1
//   MOCK_PORT=9000 node scripts/mock-llm.mjs
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 8787);
const EMBED_DIM = Number(process.env.MOCK_EMBED_DIM ?? 1536);

// 与入库迁移里的 vector(1536) 必须一致，否则 pgvector 会直接报维度不符。

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
  });
}

// 回显**上下文**（system 消息）。注意 system 排在 messages 最前面，
// 所以不能取「末段」——那只会取到用户那句提问，而待办、打卡、检索到的资料都在 system 里。
// 把整段 system 带进回复，就能断言「这些数据是否真的走到了模型面前」。
function buildReply(messages) {
  if (!Array.isArray(messages)) return "【MOCK】没有收到任何消息。";
  const sys = messages
    .filter((m) => m?.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "")))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
  const lastUser = [...messages].reverse().find((m) => m?.role === "user");
  const q = typeof lastUser?.content === "string" ? lastUser.content : "";
  return `【MOCK】关于「${q.slice(0, 60)}」，我在上下文里读到的内容是：${sys.slice(0, 4000)}`;
}

/** 基于文本的确定性伪向量：同文本必得同向量，便于复现。 */
function fakeEmbedding(text, dim) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const seed = (h >>> 0) % 100000;
  const out = new Array(dim);
  for (let j = 0; j < dim; j++) out[j] = Math.sin(seed * 0.0001 + j * 0.37) * 0.1;
  return out;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const raw = await readBody(req);
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    /* 保持空对象 */
  }

  // ── 对话补全
  if (url.pathname.endsWith("/chat/completions")) {
    const text = buildReply(body.messages);
    const model = body.model ?? "mock-chat";
    const created = Math.floor(Date.now() / 1000);

    if (body.stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const id = "chatcmpl-mock";
      const chunk = (delta, finish = null) =>
        `data: ${JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta, finish_reason: finish }],
        })}\n\n`;
      res.write(chunk({ role: "assistant", content: "" }));
      // 切成小片推，模拟真实流式（前端是流式渲染的）
      for (const piece of text.match(/[\s\S]{1,24}/g) ?? []) res.write(chunk({ content: piece }));
      res.write(chunk({}, "stop"));
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        id: "chatcmpl-mock",
        object: "chat.completion",
        created,
        model,
        choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
    return;
  }

  // ── 向量
  if (url.pathname.endsWith("/embeddings")) {
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    const data = inputs.map((v, i) => ({
      object: "embedding",
      index: i,
      embedding: fakeEmbedding(v, EMBED_DIM),
    }));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        object: "list",
        data,
        model: body.model ?? "mock-embed",
        usage: { prompt_tokens: 1, total_tokens: 1 },
      }),
    );
    return;
  }

  // ── 模型列表
  if (url.pathname.endsWith("/models")) {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        object: "list",
        data: [
          { id: "mock-chat", object: "model", owned_by: "mock" },
          { id: "mock-embed", object: "model", owned_by: "mock" },
        ],
      }),
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: { message: `mock: 未实现的路径 ${url.pathname}` } }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock LLM listening on http://127.0.0.1:${PORT}/v1  (embed dim ${EMBED_DIM})`);
});
