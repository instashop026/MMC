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

export const ZERO_STORAGE_APP_ROOT_NAME = "0RMCOIN";

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

async function listAllPages<T>(
  load: (page: number) => Promise<ZeroStoragePage<T>>,
): Promise<T[]> {
  const first = await load(1);
  const items = [...first.items];
  const limit = Math.max(first.limit, first.items.length, 1);
  const pageCount = Math.max(1, Math.ceil(first.total / limit));
  for (let start = 2; start <= pageCount; start += 4) {
    const pages = Array.from({ length: Math.min(4, pageCount - start + 1) }, (_, index) => start + index);
    const results = await Promise.all(pages.map(load));
    for (const result of results) items.push(...result.items);
  }
  return items;
}

export async function listAllFolders(folderId?: string): Promise<ZeroFolder[]> {
  return listAllPages((page) => listFolders(folderId, page));
}

export async function listAllFiles(folderId?: string): Promise<ZeroFile[]> {
  return listAllPages((page) => listFiles(folderId, page));
}

export async function findApplicationRootFolder(): Promise<ZeroFolder> {
  const matches = (await listAllFolders()).filter(
    (folder) => folder.name.trim().toLowerCase() === ZERO_STORAGE_APP_ROOT_NAME.toLowerCase(),
  );
  if (matches.length === 0) {
    throw new Error(`The ZeroStorage folder ${ZERO_STORAGE_APP_ROOT_NAME} was not found at the storage root.`);
  }
  if (matches.length > 1) {
    throw new Error(`More than one ${ZERO_STORAGE_APP_ROOT_NAME} folder exists at the storage root.`);
  }
  return matches[0];
}

export interface ZeroStorageSelectedFolder extends ZeroFolder {
  sourcePath: string;
}

export interface ZeroStorageImportFile extends ZeroFile {
  parentFolderId: string;
  sourcePath: string;
}

export async function collectMediaUnderFolder(
  selectedFolder: ZeroStorageSelectedFolder,
  expectedType: MediaType,
): Promise<ZeroStorageImportFile[]> {
  const queue: ZeroStorageSelectedFolder[] = [selectedFolder];
  const visited = new Set<string>();
  const files: ZeroStorageImportFile[] = [];
  let cursor = 0;

  while (cursor < queue.length) {
    const current = queue[cursor++];
    if (!current.id || visited.has(current.id)) continue;
    visited.add(current.id);

    const [folderFiles, childFolders] = await Promise.all([
      listAllFiles(current.id),
      listAllFolders(current.id),
    ]);
    const source = sourceForPath(current.sourcePath);
    const sourceMatches = expectedType === "image"
      ? source === "ctele" || source === "eb"
      : source === "wt";
    if (sourceMatches) {
      for (const file of folderFiles) {
        if (file.type === expectedType) {
          files.push({
            ...file,
            parentFolderId: current.id,
            sourcePath: current.sourcePath,
            source,
          });
        }
      }
    }

    for (const folder of childFolders) {
      queue.push({
        ...folder,
        sourcePath: `${current.sourcePath}/${folder.name}`,
      });
    }
  }

  return files.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.name.localeCompare(b.name));
}

export async function revalidateZeroStorageFiles(
  selectedFiles: ZeroStorageImportFile[],
): Promise<{ available: ZeroStorageImportFile[]; missing: ZeroStorageImportFile[] }> {
  const folders = new Map<string, ZeroStorageImportFile[]>();
  for (const file of selectedFiles) {
    const group = folders.get(file.parentFolderId) ?? [];
    group.push(file);
    folders.set(file.parentFolderId, group);
  }

  const availableById = new Map<string, ZeroFile>();
  const folderIds = [...folders.keys()];
  for (let start = 0; start < folderIds.length; start += 4) {
    await Promise.all(folderIds.slice(start, start + 4).map(async (folderId) => {
      const files = await listAllFiles(folderId);
      for (const file of files) availableById.set(file.id, file);
    }));
  }

  const available: ZeroStorageImportFile[] = [];
  const missing: ZeroStorageImportFile[] = [];
  for (const selected of selectedFiles) {
    const current = availableById.get(selected.id);
    if (!current) {
      missing.push(selected);
      continue;
    }
    available.push({
      ...selected,
      ...current,
      parentFolderId: selected.parentFolderId,
      sourcePath: selected.sourcePath,
      source: sourceForPath(selected.sourcePath),
    });
  }
  return { available, missing };
}

export function sourceForPath(path: string): ContentSource | null {
  const segments = path.split("/").map((part) => part.trim()).filter(Boolean);
  const appRootIndex = segments.findIndex((part) => part.toLowerCase() === ZERO_STORAGE_APP_ROOT_NAME.toLowerCase());
  const source = (segments[appRootIndex >= 0 ? appRootIndex + 1 : 0] ?? "").toLowerCase();
  if (source === "ctele") return "ctele";
  if (source === "eb") return "eb";
  if (source === "wt") return "wt";
  return null;
}