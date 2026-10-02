import type { ContentSource, MediaType } from "../types/models";
import { getSessionAccessToken } from "./supabase";

export interface ZeroFolder {
  id: string;
  name: string;
  fileCount?: number;
}

export interface ZeroFile {
  id: string;
  name: string;
  size?: number;
  createdAt?: string;
  type: MediaType | "unknown";
  source: ContentSource | null;
}

export interface ZeroStoragePage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "heic"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm", "mkv", "avi", "wmv", "flv"]);

function getMediaType(filename: string): MediaType | "unknown" {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return "unknown";
}

async function browse(
  resource: "folders" | "files",
  path?: string,
  page = 1,
): Promise<ZeroStoragePage<ZeroFolder | ZeroFile>> {
  const token = await getSessionAccessToken();
  if (!token) throw new Error("Sign in with an admin account to browse ZeroStorage.");
  const params = new URLSearchParams({ resource, page: String(page), limit: "100" });
  if (path) params.set("folderId", path);

  const response = await fetch(`/.netlify/functions/zerostorage-browser?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = (await response.json().catch(() => null)) as
    | { error?: string; folders?: ZeroFolder[]; files?: Array<Omit<ZeroFile, "type" | "source"> & { name: string }>; total?: number; page?: number; limit?: number }
    | null;
  if (!response.ok) {
    throw new Error(result?.error || `ZeroStorage request failed (${response.status}).`);
  }

  if (resource === "folders") {
    const folders = Array.isArray(result?.folders) ? result.folders : [];
    return {
      items: folders,
      total: result?.total ?? folders.length,
      page: result?.page ?? 1,
      limit: result?.limit ?? folders.length,
    };
  }
  const files: ZeroFile[] = (result?.files ?? []).map((file) => ({
    ...file,
    type: getMediaType(file.name),
    source: null,
  }));
  return {
    items: files,
    total: result?.total ?? files.length,
    page: result?.page ?? 1,
    limit: result?.limit ?? files.length,
  };
}

export async function listFolders(path?: string, page = 1): Promise<ZeroStoragePage<ZeroFolder>> {
  const result = await browse("folders", path, page);
  return { ...result, items: result.items as ZeroFolder[] };
}

export async function listFiles(path?: string, page = 1): Promise<ZeroStoragePage<ZeroFile>> {
  const result = await browse("files", path, page);
  return { ...result, items: result.items as ZeroFile[] };
}

export function sourceForPath(path: string): ContentSource | null {
  const root = path.split("/").filter(Boolean)[0]?.toLowerCase();
  if (root === "ctele") return "ctele";
  if (root === "eb") return "eb";
  if (root === "wt") return "wt";
  return null;
}