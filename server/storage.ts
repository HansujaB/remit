import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { config, required, HttpError } from "./config.js";

const root = path.resolve(config.STORAGE_DIR);
function localPath(key: string) {
  if (!/^[a-f0-9]{64}\/[a-f0-9-]+$/.test(key))
    throw new HttpError(400, "Invalid file key.");
  const file = path.resolve(root, key);
  if (!file.startsWith(root + path.sep))
    throw new HttpError(400, "Invalid file key.");
  return file;
}
let client: S3Client;
function r2() {
  return (client ||= new S3Client({
    region: "auto",
    endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  }));
}
export const storage = {
  async put(key: string, data: Buffer, mime: string) {
    const file = localPath(key);
    if (config.STORAGE_DRIVER === "r2")
      await r2().send(
        new PutObjectCommand({
          Bucket: required("R2_BUCKET"),
          Key: key,
          Body: data,
          ContentType: mime,
        }),
      );
    else {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data, { flag: "wx" });
    }
  },
  async get(key: string) {
    const file = localPath(key);
    if (config.STORAGE_DRIVER === "local") return readFile(file);
    const result = await r2().send(
      new GetObjectCommand({ Bucket: required("R2_BUCKET"), Key: key }),
    );
    return Buffer.from(await result.Body!.transformToByteArray());
  },
  async delete(key: string) {
    const file = localPath(key);
    if (config.STORAGE_DRIVER === "r2")
      await r2().send(
        new DeleteObjectCommand({ Bucket: required("R2_BUCKET"), Key: key }),
      );
    else
      await unlink(file).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
  },
};
export function detectFile(buffer: Buffer) {
  if (buffer.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return "image/jpeg";
  if (/^GIF8[79]a/.test(buffer.subarray(0, 6).toString())) return "image/gif";
  if (
    buffer.subarray(0, 4).toString() === "RIFF" &&
    buffer.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  throw new HttpError(
    400,
    "Only valid PDF, PNG, JPEG, GIF, and WebP files are accepted.",
  );
}
