import type { Model, ModelDetail, ModelInput, Post, Style } from "../types/models";
import { getSupabase } from "./supabase";
import { listPosts } from "./posts";
import { getFollowedModelIds } from "./follows";

type PageOptions = { search?: string; limit?: number; offset?: number };

function escapeSearch(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&").trim().slice(0, 100);
}

export async function listModels({
  search,
  limit = 24,
  offset = 0,
}: PageOptions = {}): Promise<Model[]> {
  const start = Math.max(0, offset);
  const end = start + Math.min(Math.max(limit, 1), 100) - 1;
  let query = getSupabase()
    .from("models")
    .select("id,name,username,slug,description,profile_image_url,profile_image_zerostorage_file_id,published,created_at,updated_at")
    .order("name", { ascending: true })
    .range(start, end);
  const term = search?.trim();
  if (term) query = query.ilike("name", `%${escapeSearch(term)}%`);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load models: ${error.message}`);
  return (data ?? []) as Model[];
}

export async function listFollowedModels(): Promise<Model[]> {
  const ids = await getFollowedModelIds();
  if (ids.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("models")
    .select("id,name,username,slug,description,profile_image_url,profile_image_zerostorage_file_id,published,created_at,updated_at")
    .in("id", ids)
    .order("name", { ascending: true });
  if (error) throw new Error(`Could not load followed models: ${error.message}`);
  return (data ?? []) as Model[];
}

export async function getModelDetail(slug: string): Promise<ModelDetail | null> {
  let query = getSupabase()
    .from("models")
    .select("id,name,username,slug,description,profile_image_url,profile_image_zerostorage_file_id,published,created_at,updated_at")
  query = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slug)
    ? query.eq("id", slug)
    : query.eq("slug", slug);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Could not load this model: ${error.message}`);
  if (!data) return null;

  const model = data as Model;
  const [stylesResult, posts, followedIds] = await Promise.all([
    getSupabase()
      .from("model_styles")
      .select("style_id,styles(id,name,slug,created_at)")
      .eq("model_id", model.id),
    listPosts({ modelId: model.id, limit: 24, offset: 0 }),
    getFollowedModelIds(),
  ]);
  if (stylesResult.error) {
    throw new Error(`Could not load this model's styles: ${stylesResult.error.message}`);
  }
  const styles = (stylesResult.data ?? []).flatMap((row) => {
    const related = row.styles as unknown as Style | Style[] | null;
    return Array.isArray(related) ? related : related ? [related] : [];
  });

  return {
    ...model,
    styles,
    posts,
    image_count: posts.filter((post) => post.type === "image").length,
    video_count: posts.filter((post) => post.type === "video").length,
    followed: followedIds.includes(model.id),
  };
}

export async function createModel(input: ModelInput): Promise<Model> {
  const payload = {
    name: input.name.trim(),
    username: input.username?.trim() || null,
    slug: input.slug.trim(),
    description: input.description?.trim() || null,
    profile_image_url: input.profile_image_zerostorage_file_id?.trim()
      ? null
      : input.profile_image_url?.trim() || null,
    profile_image_zerostorage_file_id: input.profile_image_zerostorage_file_id?.trim() || null,
    published: input.published,
  };
  const { data, error } = await getSupabase()
    .from("models")
    .insert(payload)
    .select("id,name,username,slug,description,profile_image_url,profile_image_zerostorage_file_id,published,created_at,updated_at")
    .single();
  if (error) {
    const message = error.code === "23505" ? "A model with that username or slug already exists." : error.message;
    throw new Error(`Could not create model: ${message}`);
  }
  return data as Model;
}

export async function updateModel(id: string, input: Partial<ModelInput>): Promise<Model> {
  const payload: Record<string, string | boolean | null> = {};
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.username !== undefined) payload.username = input.username?.trim() || null;
  if (input.slug !== undefined) payload.slug = input.slug.trim();
  if (input.description !== undefined) payload.description = input.description?.trim() || null;
  if (input.profile_image_url !== undefined) {
    const url = input.profile_image_url?.trim() || null;
    payload.profile_image_url = url;
    if (url) payload.profile_image_zerostorage_file_id = null;
  }
  if (input.profile_image_zerostorage_file_id !== undefined) {
    const fileId = input.profile_image_zerostorage_file_id?.trim() || null;
    if (fileId && (fileId.length > 255 || /[/\\]/.test(fileId))) {
      throw new Error("The ZeroStorage profile image ID is invalid.");
    }
    payload.profile_image_zerostorage_file_id = fileId;
    if (fileId) payload.profile_image_url = null;
  }
  if (input.published !== undefined) payload.published = input.published;
  if (Object.keys(payload).length === 0) throw new Error("Provide at least one model field to update.");

  const { data, error } = await getSupabase()
    .from("models")
    .update(payload)
    .eq("id", id)
    .select("id,name,username,slug,description,profile_image_url,profile_image_zerostorage_file_id,published,created_at,updated_at")
    .single();
  if (error) {
    const message = error.code === "23505" ? "A model with that username or slug already exists." : error.message;
    throw new Error(`Could not update model: ${message}`);
  }
  return data as Model;
}

export async function setModelStyles(modelId: string, styleIds: string[]): Promise<void> {
  const client = getSupabase();
  const { error: deleteError } = await client
    .from("model_styles")
    .delete()
    .eq("model_id", modelId);
  if (deleteError) throw new Error(`Could not update model styles: ${deleteError.message}`);

  const uniqueIds = [...new Set(styleIds)];
  if (uniqueIds.length === 0) return;
  const { error } = await client
    .from("model_styles")
    .insert(uniqueIds.map((styleId) => ({ model_id: modelId, style_id: styleId })));
  if (error) throw new Error(`Could not update model styles: ${error.message}`);
}

export async function removeModel(id: string): Promise<void> {
  const { error } = await getSupabase().from("models").delete().eq("id", id);
  if (error) throw new Error(`Could not delete model: ${error.message}`);
}

export async function modelPostCount(modelId: string): Promise<number> {
  const { count, error } = await getSupabase()
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("model_id", modelId);
  if (error) throw new Error(`Could not count model posts: ${error.message}`);
  return count ?? 0;
}

export async function visibleModelPosts(modelId: string): Promise<Post[]> {
  return listPosts({ modelId, limit: 24, offset: 0 });
}