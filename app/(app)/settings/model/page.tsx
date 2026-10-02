import type { Metadata } from "next";
import { ModelSettings } from "@/components/settings/ModelSettings";

export const metadata: Metadata = { title: "模型设置" };

export default function ModelSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6">
      <h1 className="mb-1 text-xl font-medium tracking-tight text-ink">模型设置</h1>
      <p className="mb-5 text-xs text-muted">
        平台不预置任何密钥，由你自己填；配置只存在本机浏览器
      </p>
      <ModelSettings />
    </div>
  );
}
