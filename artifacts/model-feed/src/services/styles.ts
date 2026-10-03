import type { Model, Post, Style, StyleDetail } from "../types/models";
import { getSupabase } from "./supabase";
import { listPosts } from "./posts";

export async function listStyles({
  limit = 60,
  offset = 0,
}: {
  limit?: number;
  offset?: number;
} = {}): Promise<Style[]> {
  const { data, error } = await getSupabase()
    .from("styles")
    .select("id,name,slug,created_at")
    .order("name", { ascending: true })
    .range(Math.max(0, offset), Math.max(0, offset) + Math.min(Math.max(limit, 1), 100) - 1);
  if (error) throw new Error(`Could not load styles: ${error.message}`);
  return (data ?? []) as Style[];
}

export async function createStyle(name: string): Promise<Style> {
  const { cleanName, slug } = normalizeStyle(name);

  const { data, error } = await getSupabase()
    .from("styles")
    .insert({ name: cleanName, slug })
    .select("id,name,slug,created_at")
    .single();
  if (error) {
    const message = error.code === "23505"
      ? "A style with the same normalized name already exists."
      : error.message;
    throw new Error(`Could not create style: ${message}`);
  }
  return data as Style;
}

function normalizeStyle(name: string): { cleanName: string; slug: string } {
  const cleanName = name.trim().replace(/\s+/g, " ");
  if (!cleanName || cleanName.length > 80) throw new Error("Style names must be between 1 and 80 characters.");
  const slug = cleanName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) throw new Error("Enter a style name with at least one letter or number.");
  return { cleanName, slug };
}

function normalizedStyleName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function allStyles(): Promise<Style[]> {
  const result: Style[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await listStyles({ limit: 100, offset });
    result.push(...page);
    if (page.length < 100) return result;
  }
}

export async function findOrCreateStyle(name: string): Promise<Style> {
  const candidate = normalizeStyle(name);
  const matches = (styles: Style[]) => styles.find((style) =>
    style.slug === candidate.slug
    || normalizedStyleName(style.name) === normalizedStyleName(candidate.cleanName),
  );
  const existing = matches(await allStyles());
  if (existing) return existing;

  try {
    return await createStyle(candidate.cleanName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/23505|already exists|duplicate key/i.test(message)) throw error;
    const raced = matches(await allStyles());
    if (raced) return raced;
    throw error;
  }
}

export async function updateStyle(id: string, name: string): Promise<Style> {
  const { cleanName, slug } = normalizeStyle(name);
  const { data, error } = await getSupabase()
    .from("styles")
    .update({ name: cleanName, slug })
    .eq("id", id)
    .select("id,name,slug,created_at")
    .single();
  if (error) {
    const message = error.code === "23505"
      ? "A style with the same normalized name or slug already exists."
      : error.message;
    throw new Error(`Could not update style: ${message}`);
  }
  return data as Style;
}

export async function deleteStyle(id: string): Promise<void> {
  const { error } = await getSupabase().from("styles").delete().eq("id", id);
  if (error) throw new Error(`Could not delete style: ${error.message}`);
}

export async function getStyleDetail(slug: string): Promise<StyleDetail | null> {
  const { data: style, error } = await getSupabase()
    .from("styles")
    .select("id,name,slug,created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Could not load this style: ${error.message}`);
  if (!style) return null;

  const [modelsResult, postLinks] = await Promise.all([
    getSupabase()
      .from("model_styles")
      .select("model_id,models(id,name,username,slug,description,profile_image_url,profile_image_zerostorage_file_id,published,created_at,updated_at)")
      .eq("style_id", style.id),
    getSupabase().from("post_styles").select("post_id").eq("style_id", style.id),
  ]);
  if (modelsResult.error) throw new Error(`Could not load related models: ${modelsResult.error.message}`);
  if (postLinks.error) throw new Error(`Could not load related posts: ${postLinks.error.message}`);

  const models = (modelsResult.data ?? []).flatMap((row) => {
    const related = row.models as unknown as Model | Model[] | null;
    return Array.isArray(related) ? related : related ? [related] : [];
  });
  const posts: Post[] = await listPosts({
    limit: 24,
    offset: 0,
    postIds: (postLinks.data ?? []).map((row) => row.post_id as string),
  });
  return { ...(style as Style), models, posts };
}
