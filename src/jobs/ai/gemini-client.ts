/**
 * Moved to shared/ai so the Nitro API can import it too (pliego summaries run on
 * both the batch side and the request side). Re-exported here so existing
 * src/jobs importers keep their `./ai/gemini-client` path.
 */
export * from "../../../shared/ai/gemini-client";
