"""Outlines the "NiceIdeas" wordmark from Inter (wght 750) so it never depends on installed fonts.

The capital I is replaced by a serifed I (same as the mockups) so "NiceIdeas" never reads "Niceldeas".
"""
import pathlib
import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[4]
FONT = ROOT / "public/fonts/inter/inter-latin-wght-normal.woff2"
WEIGHT = 750
TRACKING = -0.03  # em, matches the mockups' letter-spacing
SERIF_I = "M2 0h30v11H23v51h9v11H2V62h9V11H2z"  # 34 x 73 box, top-left origin
SERIF_I_W = 34

def _font():
    tt = TTFont(str(FONT))
    from fontTools.varLib.instancer import instantiateVariableFont
    static = instantiateVariableFont(tt, {"wght": WEIGHT})
    upem = static["head"].unitsPerEm
    import io
    buf = io.BytesIO(); static.flavor = None; static.save(buf)
    face = hb.Face(buf.getvalue()); font = hb.Font(face)
    return static, font, upem

def wordmark(height_px=100.0):
    """Returns (svg_body_parts, width, height) at cap-height-based scale; parts = [(path_d, role)]."""
    static, font, upem = _font()
    cap = static["OS/2"].sCapHeight
    gs = static.getGlyphSet()
    order = static.getGlyphOrder()
    buf = hb.Buffer(); buf.add_str("NiceIdeas"); buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True})
    s = height_px / cap  # px per font unit; cap height == height_px
    x = 0.0
    parts = []
    track = TRACKING * upem
    for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
        name = order[info.codepoint]
        role = "nice" if info.cluster < 4 else "ideas"
        if info.cluster == 4:  # serif capital I, scaled to cap height
            k = cap / 73.0
            pen_x = x + 0.04 * upem
            d = SERIF_I
            parts.append((d, role, (pen_x * s, 0.0, k * s)))
            x += SERIF_I_W * k + 0.06 * upem + track
            continue
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (s, 0, 0, -s, x * s, cap * s)))
        parts.append((pen.getCommands(), role, None))
        x += pos.x_advance + track
    width = (x - track) * s
    return parts, width, height_px, (static["OS/2"].sTypoDescender / cap) * -height_px

def to_svg_group(parts, ink, accent):
    out = []
    for d, role, tf in parts:
        fill = ink if role == "nice" else accent
        if tf:
            tx, ty, k = tf
            out.append(f'<path d="{d}" fill="{fill}" transform="translate({tx:.2f} {ty:.2f}) scale({k:.5f})"/>')
        else:
            out.append(f'<path d="{d}" fill="{fill}"/>')
    return "".join(out)

if __name__ == "__main__":
    parts, w, h, desc = wordmark()
    print(round(w, 1), h, round(desc, 1))
