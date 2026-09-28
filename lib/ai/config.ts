// 用户自填的 LLM 配置。密钥只在单次请求生命周期内存在于内存，不落库、不写日志。
// 见 PLAN §4.2 / §4.3。

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  embedModel?: string;
  temperature: number;
};

export type ParseFailure = {
  ok: false;
  reason: "missing_base_url" | "missing_api_key" | "missing_model" | "bad_url";
};

export type ParseResult = { ok: true; config: LlmConfig } | ParseFailure;

export const PARSE_FAILURE_TEXT: Record<ParseFailure["reason"], string> = {
  missing_base_url: "还没填 Base URL",
  missing_api_key: "还没填 API Key",
  missing_model: "还没填对话模型名",
  bad_url: "Base URL 必须以 http:// 或 https:// 开头",
};

function clampTemperature(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.3;
  return Math.min(2, Math.max(0, n));
}

export function parseLlmConfig(input: unknown): ParseResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "missing_base_url" };
  }
  const raw = input as Record<string, unknown>;

  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
  if (!baseUrl) return { ok: false, reason: "missing_base_url" };
  if (!/^https?:\/\//i.test(baseUrl)) return { ok: false, reason: "bad_url" };

  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
  if (!apiKey) return { ok: false, reason: "missing_api_key" };

  const chatModel = typeof raw.chatModel === "string" ? raw.chatModel.trim() : "";
  if (!chatModel) return { ok: false, reason: "missing_model" };

  const embedModel =
    typeof raw.embedModel === "string" && raw.embedModel.trim() ? raw.embedModel.trim() : undefined;

  return {
    ok: true,
    config: {
      // 各家 base URL 有的带 /v1 有的不带，这里只去掉结尾斜杠，不做别的猜测
      baseUrl: baseUrl.replace(/\/+$/, ""),
      apiKey,
      chatModel,
      embedModel,
      temperature: clampTemperature(raw.temperature),
    },
  };
}

/** 展示用：只留后 4 位。 */
export function maskKey(key: string): string {
  if (key.length <= 4) return "****";
  return `${"*".repeat(Math.min(8, key.length - 4))}${key.slice(-4)}`;
}
