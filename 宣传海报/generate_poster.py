from PIL import Image, ImageDraw, ImageFont, ImageFilter
import qrcode
from pathlib import Path
import math

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "宣传海报"
URL = "https://ai-partner-fenqian-staging.onrender.com/decision-tree.html"

W, H = 1080, 1440


def font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/STHeiti Medium.ttc" if bold else "/Users/susize/pot/ai在线合伙分钱服务/assets/fonts/NotoSansSC-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for p in candidates:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()


F = {
    "micro": font(20),
    "tiny": font(24),
    "small": font(28),
    "body": font(32),
    "body_b": font(32, True),
    "mid": font(42, True),
    "sub": font(52, True),
    "title": font(82, True),
    "brand": font(34, True),
    "num": font(46, True),
}


def rounded(draw, xy, r, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=r, fill=fill, outline=outline, width=width)


def text(draw, xy, s, fill="#111111", f=None, anchor=None, spacing=6, align="left"):
    draw.multiline_text(xy, s, fill=fill, font=f or F["body"], anchor=anchor, spacing=spacing, align=align)


def fit_text(draw, xy, s, max_w, fill, f, line_gap=8):
    words = list(s)
    lines, cur = [], ""
    for ch in words:
        test = cur + ch
        if draw.textbbox((0, 0), test, font=f)[2] <= max_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    text(draw, xy, "\n".join(lines), fill, f, spacing=line_gap)
    return lines


def shadow_card(base, xy, r=28, fill="#FFFFFF", shadow="#000000", alpha=24, offset=(0, 14)):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    sx0, sy0, sx1, sy1 = xy[0] + offset[0], xy[1] + offset[1], xy[2] + offset[0], xy[3] + offset[1]
    d.rounded_rectangle((sx0, sy0, sx1, sy1), radius=r, fill=(*hex_to_rgb(shadow), alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(16))
    base.alpha_composite(layer)
    d = ImageDraw.Draw(base)
    d.rounded_rectangle(xy, radius=r, fill=fill)


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def draw_grid(d):
    for x in range(80, W, 80):
        d.line((x, 0, x, H), fill="#163B38", width=1)
    for y in range(80, H, 80):
        d.line((0, y, W, y), fill="#163B38", width=1)


def draw_protocol_map(d):
    # Subtle background graph: people -> rights -> documents.
    nodes = [
        (182, 735, "出资"),
        (328, 650, "出力"),
        (492, 735, "资源"),
        (690, 656, "控制"),
        (842, 742, "退出"),
        (515, 876, "协议包"),
    ]
    edges = [(0, 5), (1, 5), (2, 5), (3, 5), (4, 5), (1, 3), (2, 3)]
    for a, b in edges:
        x1, y1, _ = nodes[a]
        x2, y2, _ = nodes[b]
        d.line((x1, y1, x2, y2), fill="#B7C7BF", width=3)
    for i, (x, y, label) in enumerate(nodes):
        r = 44 if label != "协议包" else 58
        fill = "#F7FBF8" if label != "协议包" else "#0F3F38"
        outline = "#8EB4A6" if label != "协议包" else "#0F3F38"
        d.ellipse((x-r, y-r, x+r, y+r), fill=fill, outline=outline, width=3)
        d.text((x, y), label, font=F["small"], fill="#FFFFFF" if label == "协议包" else "#173A34", anchor="mm")


def create_qr():
    qr = qrcode.QRCode(version=3, box_size=8, border=2)
    qr.add_data(URL)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#111111", back_color="#FFFFFF").convert("RGBA")
    return img.resize((182, 182), Image.Resampling.NEAREST)


def main():
    base = Image.new("RGBA", (W, H), "#F7F8F5")
    d = ImageDraw.Draw(base)

    # Soft premium background, no visible grid.
    wash = Image.new("RGBA", base.size, (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash)
    wd.ellipse((-260, -180, 480, 520), fill=(185, 220, 208, 68))
    wd.ellipse((560, 70, 1320, 840), fill=(210, 226, 255, 54))
    wd.ellipse((180, 910, 1040, 1640), fill=(196, 230, 216, 62))
    wash = wash.filter(ImageFilter.GaussianBlur(90))
    base.alpha_composite(wash)
    d = ImageDraw.Draw(base)

    # Strict aligned margins.
    L, R = 72, 1008
    col_mid = 540

    # Brand.
    d.text((L, 72), "斯塔管理咨询", font=F["brand"], fill="#14201C")
    d.text((R, 80), "AI PARTNERSHIP TOOL · BETA", font=F["tiny"], fill="#8C9892", anchor="ra")
    d.line((L, 122, R, 122), fill="#DDE4DD", width=2)

    # Hero.
    d.text((L, 180), "把合伙规则\n变成协议包", font=F["title"], fill="#101613", spacing=8)
    qr = create_qr().resize((138, 138), Image.Resampling.NEAREST)
    d.rounded_rectangle((822, 176, 988, 342), radius=24, fill="#FFFFFF", outline="#D8E6DF", width=3)
    base.alpha_composite(qr, (836, 190))
    d.text((905, 366), "扫码体验", font=F["micro"], fill="#596861", anchor="mm")
    d.text((L, 390), "AI 股权方案 · 五权诊断 · 协议草案", font=F["mid"], fill="#0B5D50")
    d.text((L, 450), "为正在谈合伙、已注册公司复盘、涉及代持或一致行动的团队设计。", font=F["small"], fill="#5B6761")

    # Hero accent capsule.
    d.rounded_rectangle((L, 512, 446, 566), radius=27, fill="#10231F")
    d.text((100, 539), "限量测试版", font=F["tiny"], fill="#FFFFFF", anchor="lm")
    d.rounded_rectangle((464, 512, 914, 566), radius=27, fill="#FFFFFF", outline="#D8E1DA", width=2)
    d.text((492, 539), "可复制 · 可下载 · 可讨论", font=F["tiny"], fill="#39544B", anchor="lm")

    # Main product card.
    shadow_card(base, (L, 626, R, 1058), r=36, fill="#FFFFFF", shadow="#41534D", alpha=30, offset=(0, 18))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle((104, 666, 976, 734), radius=18, fill="#F3F6F2", outline="#E1E8E1", width=2)
    d.text((134, 700), "描述合伙情况：出资 / 出力 / 代持 / 一致行动 / 退出机制", font=F["tiny"], fill="#66736C", anchor="lm")
    d.rounded_rectangle((822, 678, 946, 722), radius=13, fill="#0B5D50")
    d.text((884, 700), "生成", font=F["tiny"], fill="#FFFFFF", anchor="mm")

    # Product panels aligned.
    d.rounded_rectangle((104, 774, 504, 1018), radius=24, fill="#10231F")
    d.text((136, 820), "股权方案", font=F["body_b"], fill="#FFFFFF")
    panel_rows = [("工商登记", "15 / 40 / 45"), ("实际权益", "分红 ≠ 控制"), ("风险锚点", "代持 · 退出")]
    for i, (k, v) in enumerate(panel_rows):
        yy = 872 + i * 48
        d.text((136, yy), k, font=F["tiny"], fill="#A7BDB5")
        d.text((304, yy), v, font=F["tiny"], fill="#FFFFFF")
        if i < 2:
            d.line((136, yy + 34, 470, yy + 34), fill="#344D45", width=2)

    d.rounded_rectangle((544, 774, 976, 1018), radius=24, fill="#F1F8F5", outline="#D8E6DF", width=2)
    d.text((576, 820), "协议包草案", font=F["body_b"], fill="#10231F")
    docs = ["股东合作协议书", "股权代持协议", "一致行动人协议"]
    for i, item in enumerate(docs):
        yy = 870 + i * 48
        d.rounded_rectangle((576, yy, 932, yy + 34), radius=10, fill="#FFFFFF", outline="#DCE7E1", width=2)
        d.text((600, yy + 17), item, font=F["tiny"], fill="#10231F", anchor="lm")

    # Process row, aligned to product width.
    steps = [("01", "说清情况"), ("02", "识别矛盾"), ("03", "生成方案"), ("04", "下载交付")]
    for i, (n, label) in enumerate(steps):
        x = L + i * 234
        d.text((x, 1138), n, font=F["num"], fill="#0B5D50")
        d.text((x, 1190), label, font=F["tiny"], fill="#364740")
        if i < 3:
            d.line((x + 92, 1152, x + 178, 1152), fill="#C3D2CB", width=2)

    # CTA card.
    d.rounded_rectangle((L, 1254, R, 1374), radius=34, fill="#10231F")
    d.text((540, 1304), "扫码体验测试版", font=F["mid"], fill="#FFFFFF", anchor="mm")
    d.text((540, 1350), "2-6 人合伙｜门店 / 电商 / 科技服务", font=F["tiny"], fill="#C6D7D0", anchor="mm")

    d.text((540, 1404), "斯塔管理咨询专业方法论支持｜用于合伙方案沟通与管理决策", font=F["micro"], fill="#7D8983", anchor="mm")

    out = OUT / "AI合伙智囊-宣传海报-竖版.png"
    base.convert("RGB").save(out, quality=96)
    print(out)


if __name__ == "__main__":
    main()
