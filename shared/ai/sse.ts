/** Read a server-sent-event response without buffering the full model output. */
export async function readSseData(
  response: Response,
  onData: (data: string) => void,
  onActivity?: ((receivedBytes: number) => void) | undefined,
): Promise<void> {
  if (!response.body) throw new Error("Streaming response has no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedBytes = 0;

  const consume = (flush: boolean): void => {
    buffer = buffer.replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) onData(data);
      boundary = buffer.indexOf("\n\n");
    }

    if (flush && buffer.trim()) {
      const data = buffer
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) onData(data);
      buffer = "";
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      try { onActivity?.(receivedBytes); } catch { /* diagnostics must not break generation */ }
      buffer += decoder.decode(value, { stream: true });
      consume(false);
    }
    buffer += decoder.decode();
    consume(true);
  } finally {
    reader.releaseLock();
  }
}
