"""Builds the final NiceIdeas brand kit (Logo J "petal i", chosen 2026-10-19 21:47).

Outputs
- docs/design/brand/final/*.svg      master SVGs (mark, mono, lockups, app icon)
- public/brand/*                     web exports (favicon, touch icon, PWA icons, OG defaults, header lockup)
Run: python build_brand.py   (needs fonttools + uharfbuzz; rasterizes with rsvg-convert)
"""
import pathlib, subprocess, io
from wordmark import wordmark, to_svg_group

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
PUB = ROOT / "public/brand"
NN = ["#D94F33", "#FF5A58", "#C78612", "#F8CF5B", "#4E8C5D", "#009975", "#2B78C0", "#646AD8"]
PURPLE, INK, WHITE, LILAC = "#7C3AED", "#1F2937", "#FFFFFF", "#C4B5FD"
PETAL = ("M0 -0.30 C0.13 -0.38 0.23 -0.58 0.20 -0.76 C0.17 -0.92 -0.17 -0.92 -0.20 -0.76 "
         "C-0.23 -0.58 -0.13 -0.38 0 -0.30Z")

def mark(cx, cy, size, colors=NN, dot=PURPLE):
    """Petal-i flower inside a size x size box centred at (cx, cy). Petal tip radius = 0.92*scale."""
    scale = size / 2 / 0.925
    out = "".join(f'<path d="{PETAL}" fill="{c}" transform="translate({cx:.2f} {cy:.2f}) rotate({i*45}) scale({scale:.3f})"/>'
                  for i, c in enumerate(colors))
    return out + f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{0.17*scale:.2f}" fill="{dot}"/>'

def svg(w, h, body, title="NiceIdeas"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}" '
            f'role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n')

def lockup(ink, accent, bg=None, mark_colors=NN, dot=PURPLE):
    """Horizontal lockup: mark height 1.6 x cap height, gap 0.42 x mark."""
    parts, ww, cap, desc = wordmark(100.0)
    m = 168.0
    gap = 0.30 * m
    pad = 0
    w, h = m + gap + ww, m
    ty = (m - cap) / 2
    body = f'<rect width="{w:.1f}" height="{h:.1f}" fill="{bg}"/>' if bg else ""
    body += mark(m / 2, m / 2, m, mark_colors, dot)
    body += f'<g transform="translate({m + gap:.2f} {ty:.2f})">{to_svg_group(parts, ink, accent)}</g>'
    return w + pad, h, body

def raster(svg_path, out, size, height=None):
    args = ["rsvg-convert", "-w", str(size)] + (["-h", str(height)] if height else []) + ["-o", str(out), str(svg_path)]
    subprocess.run(args, check=True)

def og(w, h):
    """Default share image (text-only posts): brand lockup centred on a soft gradient; no locale text."""
    lw, lh, lbody = lockup(INK, PURPLE)
    k = min(w * 0.72 / lw, h * 0.30 / lh)
    body = (f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FAF5FF"/>'
            f'<stop offset=".55" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFF7ED"/></linearGradient></defs>'
            f'<rect width="{w}" height="{h}" fill="url(#g)"/>'
            f'<g transform="translate({(w - lw*k)/2:.1f} {(h - lh*k)/2:.1f}) scale({k:.4f})">{lbody}</g>')
    return svg(w, h, body)

def main():
    PUB.mkdir(parents=True, exist_ok=True)
    files = {
        "mark.svg": svg(512, 512, mark(256, 256, 472)),
        "mark-mono-ink.svg": svg(512, 512, mark(256, 256, 472, [INK]*8, INK)),
        "mark-mono-white.svg": svg(512, 512, mark(256, 256, 472, [WHITE]*8, WHITE)),
        "app-icon.svg": svg(1024, 1024, '<rect width="1024" height="1024" fill="#FFFFFF"/>' + mark(512, 512, 760)),
        "app-icon-rounded.svg": svg(1024, 1024, '<rect width="1024" height="1024" rx="224" fill="#FFFFFF"/>' + mark(512, 512, 760)),
        "favicon.svg": svg(64, 64, '<rect width="64" height="64" rx="14" fill="#FFFFFF"/>' + mark(32, 32, 58)),
    }
    for name, (ink, accent, bg) in {"lockup": (INK, PURPLE, None), "lockup-dark": (WHITE, LILAC, "#111827")}.items():
        w, h, body = lockup(ink, accent, bg)
        files[f"{name}.svg"] = svg(round(w, 1), h, body)
    w, h, body = lockup(INK, INK, None, [INK]*8, INK)
    files["lockup-mono-ink.svg"] = svg(round(w, 1), h, body)
    files["og-default.svg"] = og(1200, 630)
    # Square thumbnail (WeChat / QQ show it at ~60 px): mark only, so it stays legible.
    files["og-default-square.svg"] = svg(600, 600, '<rect width="600" height="600" fill="#FFFFFF"/>' + mark(300, 300, 440))
    for name, text in files.items():
        (HERE / name).write_text(text)
    # Web exports: header uses the SVG lockup; icons / OG are rasters for crawlers and OSes.
    for name in ["mark.svg", "lockup.svg", "lockup-dark.svg", "favicon.svg"]:
        (PUB / name).write_text(files[name])
    raster(HERE / "app-icon.svg", PUB / "apple-touch-icon.png", 180)
    raster(HERE / "app-icon.svg", PUB / "icon-192.png", 192)
    raster(HERE / "app-icon.svg", PUB / "icon-512.png", 512)
    raster(HERE / "og-default.svg", PUB / "og-default.png", 1200, 630)
    raster(HERE / "og-default-square.svg", PUB / "og-default-square.png", 600, 600)
    # favicon.ico (16/32/48) from the small-size favicon SVG.
    from PIL import Image
    pngs = []
    for s in (16, 32, 48):
        p = HERE / f".fav{s}.png"; raster(HERE / "favicon.svg", p, s); pngs.append(Image.open(p).convert("RGBA"))
    pngs[-1].save(ROOT / "src/app/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=pngs[:-1])
    for s in (16, 32, 48): (HERE / f".fav{s}.png").unlink()
    print("ok", sorted(p.name for p in PUB.iterdir()))

if __name__ == "__main__":
    main()
