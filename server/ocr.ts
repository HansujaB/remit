import { createWorker } from "tesseract.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { loadImage } from "@napi-rs/canvas";
import { HttpError } from "./config.js";
export async function ocrImage(buffer: Buffer) {
  const image = await loadImage(buffer);
  if (image.width * image.height > 24000000)
    throw new HttpError(413, "Image exceeds the 24-megapixel OCR limit.");
  const cachePath = path.resolve(".data/ocr");
  await mkdir(cachePath, { recursive: true });
  const worker = await createWorker(process.env.OCR_LANGUAGES || "eng", 1, {
    cachePath,
  });
  try {
    let timer: ReturnType<typeof setTimeout>;
    const result = await Promise.race([
      worker.recognize(buffer),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new HttpError(422, "OCR timed out. Try a smaller image.")),
          45000,
        );
      }),
    ]).finally(() => clearTimeout(timer));
    return result.data.text.slice(0, 100000);
  } finally {
    await worker.terminate();
  }
}
