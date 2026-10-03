// ----------------------------------------------------------------
// Client-side photo downscaling before upload.
//
// Phone photos are often 3–8 MB, and base64 adds a third on top — over
// Vercel's ~4.5 MB request body limit, which makes the request fail before
// it reaches our route. A 1600px JPEG is plenty for macro estimation.
// ----------------------------------------------------------------

/** Longest edge, in px, of photos sent for analysis. */
export const MAX_PHOTO_EDGE = 1600

/** Width/height after capping the longest edge at `max` (never upscales). */
export function scaledSize(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * Downscales an image file and re-encodes it as JPEG. Returns base64 without
 * the data-URL prefix. Browser-only.
 */
export async function shrinkImageToBase64(file: Blob, max = MAX_PHOTO_EDGE, quality = 0.85): Promise<string> {
  // imageOrientation applies EXIF rotation so phone photos aren't sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height, max)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', quality).split(',')[1]
  } finally {
    bitmap.close()
  }
}
