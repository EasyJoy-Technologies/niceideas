"""Outlines the lowercase "niceideas" wordmark from Nunito ExtraBold (800) so it never depends on installed fonts.

Chosen 2026-10-21 (v4 sheet, option A). "nice" takes the ink colour, "ideas" the accent.
Font: fonts/Nunito-ExtraBold.ttf (SIL OFL 1.1, fonts/OFL.txt).
"""
import io, pathlib
import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONT = pathlib.Path(__file__).resolve().parent / "fonts/Nunito-ExtraBold.ttf"
TEXT = "niceideas"
SPLIT = 4          # "nice" | "ideas"
TRACKING = -0.01   # em, matches the v4 sheet

def wordmark(height_px=100.0):
    """Returns (parts, width, cap_px, descender_px); parts = [(path_d, role, None)] scaled so cap height == height_px."""
    tt = TTFont(str(FONT))
    upem = tt["head"].unitsPerEm
    cap = tt["OS/2"].sCapHeight
    gs, order = tt.getGlyphSet(), tt.getGlyphOrder()
    buf_font = io.BytesIO(); tt.save(buf_font)
    font = hb.Font(hb.Face(buf_font.getvalue()))
    buf = hb.Buffer(); buf.add_str(TEXT); buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": False})
    s = height_px / cap
    x, track, parts = 0.0, TRACKING * upem, []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        pen = SVGPathPen(gs)
        gs[order[info.codepoint]].draw(TransformPen(pen, (s, 0, 0, -s, x * s, cap * s)))
        parts.append((pen.getCommands(), "nice" if info.cluster < SPLIT else "ideas", None))
        x += pos.x_advance + track
    return parts, (x - track) * s, height_px, (tt["OS/2"].sTypoDescender / cap) * -height_px

def to_svg_group(parts, ink, accent):
    return "".join(f'<path d="{d}" fill="{ink if role == "nice" else accent}"/>' for d, role, _ in parts)

if __name__ == "__main__":
    parts, w, h, desc = wordmark()
    print(round(w, 1), h, round(desc, 1))
