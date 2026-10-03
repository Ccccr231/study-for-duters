# 为水彩素材生成多尺寸变体，供 srcset 使用。
#
# 背景：三张资产都是 512×512，但实际显示尺寸最小只有 32px
# （玉兰 44–48px、主楼 96px、校徽 160–192px），512 的图在小尺寸上纯属浪费带宽。
#
# 档位取 128 / 256 / 384；512 原图保留但正常情况下不该被下载。
# 实测教训：最初只有 128/256 两档，@3x 屏上校徽需要 576px、主楼需要 288px，
# 都会跳档退回 512 原图（整页 87KB）——加一档 384 后才真正命中。
#
# 量化沿用既有做法：RGBA 下 MEDIANCUT 不可用，用 FASTOCTREE。
import os
from PIL import Image

SRC_DIR = "public"
VARIANTS = [128, 256, 384]
ASSETS = ["dut-magnolia.png", "dut-building.png", "dut-emblem.png"]


def quantize_save(im: Image.Image, path: str) -> None:
    q = im.quantize(colors=256, method=Image.FASTOCTREE)
    q.save(path, optimize=True)


for name in ASSETS:
    src = os.path.join(SRC_DIR, name)
    im = Image.open(src).convert("RGBA")
    base, ext = os.path.splitext(name)
    print(f"{name}  原图 {im.size[0]}x{im.size[1]}  {os.path.getsize(src) / 1024:.1f}KB")
    for w in VARIANTS:
        out = os.path.join(SRC_DIR, f"{base}-{w}{ext}")
        quantize_save(im.resize((w, w), Image.LANCZOS), out)
        print(f"    -> {os.path.basename(out):28s} {os.path.getsize(out) / 1024:5.1f}KB")
