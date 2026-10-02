// (app) 路由组的通用加载骨架：服务端取数时先渲染这个，避免白屏。
// 形状与常见页面（标题 + 两张卡 + 一块内容）对齐，减少"骨架→真内容"的跳动。
// 用 opacity 脉冲而非位移 shimmer：不触发 layout/paint，低端机也不抖。
export default function AppLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl sm:max-w-3xl flex-col gap-4 px-5 py-6" aria-hidden="true">
      <div className="h-7 w-28 skeleton rounded-lg" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 skeleton rounded-xl" />
        <div className="h-20 skeleton rounded-xl" />
      </div>
      <div className="h-40 skeleton rounded-xl" />
    </div>
  );
}
