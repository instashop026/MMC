const ZERO_STORAGE_ORIGIN = "https://test.zerostorage.net";

function encodeFileId(fileId: string): string {
  const normalized = fileId.trim();
  if (!normalized || normalized.length > 255 || /[/\\]/.test(normalized)) {
    throw new Error("A valid ZeroStorage file ID is required.");
  }
  return encodeURIComponent(normalized);
}

export function buildImageEmbedUrl(fileId: string): string {
  return `${ZERO_STORAGE_ORIGIN}/embed/image/${encodeFileId(fileId)}`;
}

export function buildVideoEmbedUrl(fileId: string): string {
  return `${ZERO_STORAGE_ORIGIN}/embed/${encodeFileId(fileId)}`;
}

export function buildDownloadUrl(fileId: string): string {
  return `${ZERO_STORAGE_ORIGIN}/api/files/download/${encodeFileId(fileId)}?track=true`;
}