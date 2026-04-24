export const DEFAULT_MAX_OUTPUT_BYTES = 32 * 1024;
export const DEFAULT_MAX_OUTPUT_LINES = 500;
export const DEFAULT_PREVIEW_BYTES = 8 * 1024;
export const DEFAULT_PREVIEW_LINES = 80;

export interface ToolOutputReference {
  fullOutputStored: boolean;
  reason: string;
  path?: string;
}

export interface ToolOutputSummary {
  content: string;
  originalBytes: number;
  originalLines: number;
  reference: ToolOutputReference;
  returnedBytes: number;
  returnedLines: number;
  thresholdBytes: number;
  thresholdLines: number;
  truncated: boolean;
}

export function summarizeToolOutput(
  content: string,
  options: {
    thresholdBytes?: number;
    thresholdLines?: number;
  } = {}
): ToolOutputSummary {
  const thresholdBytes = options.thresholdBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const thresholdLines = options.thresholdLines ?? DEFAULT_MAX_OUTPUT_LINES;
  const originalBytes = Buffer.byteLength(content, "utf8");
  const originalLines = countLines(content);
  const truncated =
    originalBytes > thresholdBytes || originalLines > thresholdLines;
  const returnedContent = truncated ? createPreview(content) : content;

  return {
    content: returnedContent,
    originalBytes,
    originalLines,
    reference: {
      fullOutputStored: false,
      reason:
        "Full output persistence is not implemented yet; a durable local log reference will be added with session storage."
    },
    returnedBytes: Buffer.byteLength(returnedContent, "utf8"),
    returnedLines: countLines(returnedContent),
    thresholdBytes,
    thresholdLines,
    truncated
  };
}

function createPreview(content: string): string {
  const previewByLine = content
    .split(/\r\n|\r|\n/)
    .slice(0, DEFAULT_PREVIEW_LINES)
    .join("\n");
  const preview =
    Buffer.byteLength(previewByLine, "utf8") > DEFAULT_PREVIEW_BYTES
      ? truncateUtf8ByBytes(previewByLine, DEFAULT_PREVIEW_BYTES)
      : previewByLine;

  return `${preview}\n[Output truncated by Sprite Harness: full output persistence is not implemented yet.]`;
}

function truncateUtf8ByBytes(content: string, maxBytes: number): string {
  let usedBytes = 0;
  let truncated = "";

  for (const character of content) {
    const characterBytes = Buffer.byteLength(character, "utf8");

    if (usedBytes + characterBytes > maxBytes) {
      break;
    }

    truncated += character;
    usedBytes += characterBytes;
  }

  return truncated;
}

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }

  return content.split(/\r\n|\r|\n/).length;
}
