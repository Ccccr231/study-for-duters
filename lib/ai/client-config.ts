// 浏览器侧的 LLM 配置存储（localStorage）。
// 默认只存在本机；服务端不落库、不记日志。见 PLAN §4.2。
// 只在客户端组件里 import。

export type StoredLlmConfig = {
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  embedModel: string;
  temperature: number;
};

const STORAGE_KEY = "duters.llm.config";

export const EMPTY_CONFIG: StoredLlmConfig = {
  baseUrl: "",
  apiKey: "",
  chatModel: "",
  embedModel: "",
  temperature: 0.3,
};

export function loadLlmConfig(): StoredLlmConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLlmConfig>;
    return {
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      chatModel: typeof parsed.chatModel === "string" ? parsed.chatModel : "",
      embedModel: typeof parsed.embedModel === "string" ? parsed.embedModel : "",
      temperature:
        typeof parsed.temperature === "number" ? parsed.temperature : 0.3,
    };
  } catch {
    return null;
  }
}

export function saveLlmConfig(config: StoredLlmConfig): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function hasLlmConfig(config: StoredLlmConfig | null): boolean {
  return Boolean(config && config.baseUrl && config.apiKey && config.chatModel);
}
