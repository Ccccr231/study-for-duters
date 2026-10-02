// /today 专属骨架：形状对齐今日页的「蓝色 hero + 波浪 + 卡片」，
// 否则每次切到今日 tab 都会先闪一块灰色通用骨架、再跳成蓝色 hero，白闪很明显。
export default function TodayLoading() {
  return (
    <div className="flex flex-col pb-8" aria-hidden="true">
      <section className="bg-dut px-5 pt-6 text-white">
        <div className="mx-auto w-full max-w-2xl sm:max-w-3xl">
          <div className="h-3 w-32 rounded skeleton-light" />
          <div className="mt-3 h-7 w-56 rounded skeleton-light" />
          <div className="mt-7 flex gap-7 pb-7">
            <div className="h-14 w-16 rounded skeleton-light" />
            <div className="h-14 w-16 rounded skeleton-light" />
            <div className="h-14 w-16 rounded skeleton-light" />
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-2xl sm:max-w-3xl flex-col gap-4 px-5 pt-6">
        <div className="h-20 skeleton rounded-xl" />
        <div className="h-32 skeleton rounded-xl" />
        <div className="h-12 skeleton rounded-xl" />
      </div>
    </div>
  );
}
