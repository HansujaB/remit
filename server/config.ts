import "dotenv/config";
import { z } from "zod";

const env = z
  .object({
    PORT: z.coerce.number().default(5174),
    HOST: z.string().default("127.0.0.1"),
    FALKORDB_URL: z.string().default("redis://127.0.0.1:6379"),
    GRAPH_PREFIX: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .default("remit_"),
    EMBEDDING_DIMENSIONS: z.coerce.number().int().min(8).max(3072).default(384),
    MAX_ITEMS: z.coerce.number().int().positive().default(1000),
    MAX_CHUNKS: z.coerce.number().int().min(1).max(200).default(60),
    MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    WORKER_POLL_MS: z.coerce.number().int().min(500).default(3000),
    STORAGE_DRIVER: z.enum(["local", "r2"]).default("r2"),
    STORAGE_DIR: z.string().default(".data/files"),
  })
  .parse(process.env);
export const config = {
  ...env,
  origins: (
    process.env.APP_ORIGINS ||
    "http://127.0.0.1:5174,http://localhost:5174,http://127.0.0.1:5173,http://localhost:5173"
  )
    .split(",")
    .map((s) => s.trim()),
  model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  embeddingModel: process.env.EMBEDDING_MODEL || "Xenova/multilingual-e5-small",
};
export class HttpError extends Error {
  retryAfterMs = 0;
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value)
    throw new HttpError(503, `Configure ${name} to enable this integration.`);
  return value;
}
export const normalize = (s: string) =>
  s.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
