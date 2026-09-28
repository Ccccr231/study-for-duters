import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LlmConfig } from "@/lib/ai/config";

// 每次调用都新建 provider：配置来自用户请求，不缓存、不落库。
function provider(config: LlmConfig) {
  return createOpenAICompatible({
    name: "duters-user-llm",
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });
}

export function chatModel(config: LlmConfig) {
  return provider(config).chatModel(config.chatModel);
}

export function embeddingModel(config: LlmConfig) {
  if (!config.embedModel) {
    throw new Error("未配置 embedding 模型");
  }
  return provider(config).embeddingModel(config.embedModel);
}
