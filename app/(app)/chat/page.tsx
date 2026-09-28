import { ChatPanel } from "@/components/liaxiaoli/ChatPanel";

export default function ChatPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="px-5 pt-5">
        <h1 className="text-xl font-medium text-ink">连小理</h1>
        <p className="mt-0.5 text-xs text-muted">
          看得到你的专注、待办和打卡数据；回答基于你自己的资料
        </p>
      </div>
      <ChatPanel />
    </div>
  );
}
