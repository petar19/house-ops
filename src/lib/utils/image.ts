// Shrinks a photo on the device before it's sent anywhere: a phone camera
// shot is several MB, far over Firestore's 1 MB per document, and a ~1600 px
// JPEG is plenty for reading a receipt or recognising products.
const MAX_SIDE = 1600;
const MAX_BASE64 = 900_000;

/** The photo as base64 JPEG (no data: prefix), small enough to store in one document. */
export async function shrinkPhoto(file: File): Promise<{ base64: string; dataUrl: string }> {
  const bitmap = await createImageBitmap(file);
  let quality = 0.8;
  let side = MAX_SIDE;
  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (base64.length <= MAX_BASE64) return { base64, dataUrl };
    quality -= 0.15;
    side = Math.round(side * 0.8);
  }
  throw new Error('Photo is too large');
}
