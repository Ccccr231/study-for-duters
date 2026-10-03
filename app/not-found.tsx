import Link from "next/link";
import { MagnoliaArt } from "@/components/dut/MagnoliaArt";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-surface px-6 py-16">
      <MagnoliaArt className="h-12 w-12" />
      <p className="text-title font-medium text-ink">这一页不存在</p>
      <p className="text-sm text-muted">地址可能输错了，或者内容已经被移走。</p>
      <Link
        href="/today"
        className="press flex h-10 items-center rounded-lg bg-dut px-5 text-sm font-medium text-white"
      >
        回到今日
      </Link>
    </main>
  );
}
