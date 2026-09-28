// (app) 路由组的加载骨架：服务端取数时先渲染这个，避免白屏。
export default function AppLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-6">
      <div className="h-7 w-28 animate-pulse rounded-lg bg-line" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 animate-pulse rounded-xl bg-line" />
        <div className="h-20 animate-pulse rounded-xl bg-line" />
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-line" />
    </div>
  );
}
