import { createClient } from "@supabase/supabase-js";

const ZERO_STORAGE_API = "https://upload.zerostorage.net/api";

type Resource = "folders" | "files";

interface ZeroFolder {
  id: string;
  name: string;
  fileCount?: number;
}

interface ZeroFile {
  id: string;
  name: string;
  size?: number;
  createdAt?: string;
}

interface ZeroListResponse<T> {
  [key: string]: unknown;
  total?: number;
  page?: number;
  limit?: number;
}

const baseHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: baseHeaders });
}

function boundedInteger(value: string | null, fallback: number, max: number): number | null {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) return null;
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function listFromPayload(payload: ZeroListResponse<unknown>, resource: Resource): unknown[] | null {
  const data = payload.data;
  const nested = isRecord(data) ? data : null;
  const candidates = [
    payload[resource],
    nested?.[resource],
    payload.items,
    nested?.items,
    Array.isArray(data) ? data : undefined,
  ];
  const arrays = candidates.filter((candidate): candidate is unknown[] => Array.isArray(candidate));
  return arrays.find((items) => items.length > 0) ?? arrays[0] ?? null;
}

function numberFromPayload(payload: ZeroListResponse<unknown>, key: "total" | "page" | "limit"): number | undefined {
  const nested = isRecord(payload.data) ? payload.data : null;
  const value = payload[key] ?? nested?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function safeFolderId(value: string | null): string | null | undefined {
  if (!value) return null;
  if (
    value.length > 255
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) return undefined;
  return value;
}

function readFolders(payload: ZeroListResponse<ZeroFolder>): ZeroFolder[] | null {
  const entries = listFromPayload(payload, "folders");
  if (!entries) return null;
  const folders: ZeroFolder[] = [];
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string") return null;
    folders.push({
      id: entry.id.slice(0, 255),
      name: entry.name.slice(0, 255),
      ...(typeof entry.fileCount === "number" ? { fileCount: entry.fileCount } : {}),
    });
  }
  return folders;
}

function readFiles(payload: ZeroListResponse<ZeroFile>): ZeroFile[] | null {
  const entries = listFromPayload(payload, "files");
  if (!entries) return null;
  const files: ZeroFile[] = [];
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string") return null;
    files.push({
      id: entry.id.slice(0, 255),
      name: entry.name.slice(0, 255),
      ...(typeof entry.size === "number" && Number.isFinite(entry.size) ? { size: entry.size } : {}),
      ...(typeof entry.createdAt === "string" ? { createdAt: entry.createdAt.slice(0, 64) } : {}),
    });
  }
  return files;
}

async function authorizeAdmin(request: Request): Promise<
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string }
> {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/i);
  if (!match) return { ok: false, status: 401, message: "Sign in to continue." };

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    return { ok: false, status: 503, message: "Server authentication is not configured." };
  }

  const client = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
  });
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) {
    return { ok: false, status: 401, message: "Your sign-in has expired. Sign in again." };
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("ZeroStorage admin profile lookup failed:", profileError.message);
    return { ok: false, status: 503, message: "Could not verify admin access." };
  }
  if (profile?.role !== "admin") {
    return { ok: false, status: 403, message: "Admin access is required to browse ZeroStorage." };
  }
  return { ok: true, userId: data.user.id };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders });
  }
  if (request.method !== "GET") {
    return json(405, { error: "Only GET requests are supported." });
  }

  const authorization = await authorizeAdmin(request);
  if (authorization.ok === false) {
    return json(authorization.status, { error: authorization.message });
  }

  const apiKey = process.env.ZEROSTORAGE_API_KEY;
  if (!apiKey) {
    return json(503, { error: "ZeroStorage is not configured. Add ZEROSTORAGE_API_KEY to Netlify environment variables." });
  }

  const url = new URL(request.url);
  const resource = url.searchParams.get("resource");
  if (resource !== "folders" && resource !== "files") {
    return json(400, { error: "Choose a valid ZeroStorage resource." });
  }

  const folderId = safeFolderId(url.searchParams.get("folderId"));
  if (folderId === undefined) return json(400, { error: "The folder ID is invalid." });
  const page = boundedInteger(url.searchParams.get("page"), 1, 100000);
  const limit = boundedInteger(url.searchParams.get("limit"), 50, 100);
  if (page === null || limit === null) {
    return json(400, { error: "Page must be between 1 and 100,000 and limit between 1 and 100." });
  }
  const search = url.searchParams.get("search")?.trim().slice(0, 100);

  const upstreamUrl = new URL(
    resource === "folders" ? `${ZERO_STORAGE_API}/folders` : `${ZERO_STORAGE_API}/files`,
  );
  if (resource === "folders") {
    upstreamUrl.searchParams.set("parentId", folderId ?? "root");
  } else if (folderId) {
    upstreamUrl.searchParams.set("folderId", folderId);
  }
  upstreamUrl.searchParams.set("page", String(page));
  upstreamUrl.searchParams.set("limit", String(limit));
  if (resource === "files" && search) upstreamUrl.searchParams.set("search", search);

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(15000),
    });
    if (!upstreamResponse.ok) {
      console.error("ZeroStorage list request failed:", {
        status: upstreamResponse.status,
        resource,
        userId: authorization.userId,
      });
      if (upstreamResponse.status === 401 || upstreamResponse.status === 403) {
        return json(502, { error: "ZeroStorage rejected its server-side API key. Check the Netlify secret and its access." });
      }
      return json(502, { error: "ZeroStorage could not return this folder listing. Try again shortly." });
    }

    const payload = await upstreamResponse.json() as ZeroListResponse<ZeroFolder | ZeroFile>;
    const items = resource === "folders"
      ? readFolders(payload as ZeroListResponse<ZeroFolder>)
      : readFiles(payload as ZeroListResponse<ZeroFile>);
    if (!items) {
      console.error("ZeroStorage returned an unsupported list response:", {
        resource,
        responseKeys: Object.keys(payload),
        userId: authorization.userId,
      });
      return json(502, { error: "ZeroStorage returned an unexpected folder listing. Check the connection and try again." });
    }
    const common = {
      total: numberFromPayload(payload, "total") ?? items.length,
      page: numberFromPayload(payload, "page") ?? page,
      limit: numberFromPayload(payload, "limit") ?? limit,
    };
    return resource === "folders"
      ? json(200, { ...common, folders: items })
      : json(200, { ...common, files: items });
  } catch (error) {
    console.error("ZeroStorage list request errored:", {
      message: error instanceof Error ? error.message : "unknown error",
      resource,
      userId: authorization.userId,
    });
    return json(502, { error: "Could not reach ZeroStorage. Check the connection and try again." });
  }
}