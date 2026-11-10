import sharp from "./sharp";

/** Side of the thumbnail the colour is read from: enough for a histogram, cheap to decode. */
const SAMPLE_SIDE = 64;

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/**
 * Dominant colour ("#rrggbb") of an image, read from one of its small renditions: the backdrop of the
 * image frame on post pages (and its loading placeholder). Transparent parts count as white; animated
 * images use their first frame. null when the file cannot be read — the colour is optional, an upload
 * never fails for it.
 */
export async function dominantTone(file: string): Promise<string | null> {
  try {
    // stats() reads its input as is (no resize / flatten), so the thumbnail is made first.
    const thumb = await sharp(file, { animated: false })
      .resize(SAMPLE_SIDE, SAMPLE_SIDE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
    const { dominant } = await sharp(thumb).stats();
    return `#${hex2(dominant.r)}${hex2(dominant.g)}${hex2(dominant.b)}`;
  } catch {
    return null;
  }
}
