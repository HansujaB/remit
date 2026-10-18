import { pipeline, env } from "@huggingface/transformers";
import path from "node:path";
import { config } from "./config.js";
env.cacheDir = path.resolve(".data/models");
let extractor: Promise<any> | undefined;
export async function embeddings(
  texts: string[],
  type: "query" | "passage" = "passage",
): Promise<number[][]> {
  const model = await (extractor ||= pipeline(
    "feature-extraction",
    config.embeddingModel,
    { dtype: "q8", device: "cpu" },
  ).catch((e) => {
    extractor = undefined;
    throw e;
  }));
  const vectors: number[][] = [];
  for (const text of texts) {
    const output = await model(`${type}: ${text.slice(0, 6000)}`, {
      pooling: "mean",
      normalize: true,
    });
    const vector = Array.from(output.data) as number[];
    if (vector.length !== config.EMBEDDING_DIMENSIONS)
      throw new Error(
        "Embedding dimensions mismatch; reindex with a matching model and graph.",
      );
    vectors.push(vector);
  }
  return vectors;
}
