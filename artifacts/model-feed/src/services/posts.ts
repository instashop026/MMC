import type {
  Comment,
  ContentSource,
  MediaType,
  Model,
  Post,
  PostInput,
  PostUpdate,
  Style,
} from "../types/models";
import { getSupabase } from "./supabase";
import { postStats } from "./interactions";
import { buildDownloadUrl } from "../lib/zerostorage-urls";

export interface ListPostsOptions {
  limit: number;
  offset: number;
  modelId?: string;
  type?: MediaType;
  search?: string;
  styleId?: string;
  postIds?: string[];
}

function escapeSearch(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&").trim().slice(0, 100);
}

export async function listPosts({
  limit,
  offset,
  modelId,
  type,
  search,
  styleId,
  postIds,
}: ListPostsOptions): Promise<Post[]> {
  const client = getSupabase();
  let query = client
    .from("posts")
    .select("id,model_id,content_source_id,type,zerostorage_file_id,filename,caption,source,source_path,published,created_at,updated_at")
    .order("created_at", { ascending: false })
    .range(Math.max(0, offset), Math.max(0, offset) + Math.min(Math.max(limit, 1), 100) - 1);

  if (modelId) query = query.eq("model_id", modelId);
  if (type) query = query.eq("type", type);
  const term = search?.trim();
  if (term) query = query.ilike("caption", `%${escapeSearch(term)}%`);

  if (styleId) {
    const { data: links, error: styleError } = await client
      .from("post_styles")
      .select("post_id")
      .eq("style_id", styleId);
    if (styleError) throw new Error(`Could not filter posts by style: ${styleError.message}`);
    const ids = (links ?? []).map((link) => link.post_id as string);
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  } else if (postIds) {
    if (postIds.length === 0) return [];
    query = query.in("id", postIds.slice(0, 100));
  }

  const { data, error } = await query;
  if (error) throw new Error(`Could not load posts: ${error.message}`);
  const rows = (data ?? []) as Post[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const modelIds = [...new Set(rows.map((row) => row.model_id))];
  const [modelsResult, styleResult, stats] = await Promise.all([
    client
      .from("models")
      .select("id,name,username,slug,description,profile_image_url,published,created_at,updated_at")
      .in("id", modelIds),
    client
      .from("post_styles")
      .select("post_id,style_id,styles(id,name,slug,created_at)")
      .in("post_id", ids),
    postStats(ids),
  ]);
  if (modelsResult.error) throw new Error(`Could not load post models: ${modelsResult.error.message}`);
  if (styleResult.error) throw new Error(`Could not load post styles: ${styleResult.error.message}`);

  const modelById = new Map(
    ((modelsResult.data ?? []) as Model[]).map((model) => [model.id, model]),
  );
  const stylesByPost = new Map<string, Style[]>();
  for (const link of styleResult.data ?? []) {
    const style = link.styles as unknown as Style | null;
    if (!style) continue;
    const list = stylesByPost.get(link.post_id as string) ?? [];
    list.push(style);
    stylesByPost.set(link.post_id as string, list);
  }

  return rows.map((row) => ({
    ...row,
    media_url: buildDownloadUrl(row.zerostorage_file_id),
    model: modelById.get(row.model_id),
    styles: stylesByPost.get(row.id) ?? [],
    like_count: stats.get(row.id)?.like_count ?? 0,
    mmc_count: stats.get(row.id)?.mmc_count ?? 0,
    comment_count: stats.get(row.id)?.comment_count ?? 0,
    liked_by_me: stats.get(row.id)?.liked_by_me ?? false,
    mmc_by_me: stats.get(row.id)?.mmc_by_me ?? false,
  }));
}

export async function getPost(id: string): Promise<Post | null> {
  const posts = await listPosts({ limit: 1, offset: 0, postIds: [id] });
  return posts[0] ?? null;
}

export async function createPost(input: PostInput): Promise<Post> {
  const client = getSupabase();
  const fileId = input.zerostorage_file_id.trim();
  if (!fileId || fileId.length > 255) throw new Error("A valid ZeroStorage file ID is required.");
  if ((input.source === "wt") !== (input.type === "video")) {
    throw new Error("CTele and EB posts must be images; WT posts must be videos.");
  }

  const { data: existing, error: checkError } = await client
    .from("posts")
    .select("id")
    .eq("zerostorage_file_id", fileId)
    .maybeSingle();
  if (checkError) throw new Error(`Could not check for duplicate media: ${checkError.message}`);
  if (existing) throw new Error(`Already imported. Existing post ID: ${existing.id}.`);

  const { data, error } = await client
    .from("posts")
    .insert({
      model_id: input.model_id,
      content_source_id: input.content_source_id ?? null,
      type: input.type,
      zerostorage_file_id: fileId,
      filename: input.filename?.trim() || null,
      caption: input.caption?.trim() || null,
      source: input.source,
      source_path: input.source_path?.trim() || null,
      published: input.published,
    })
    .select("id,model_id,content_source_id,type,zerostorage_file_id,filename,caption,source,source_path,published,created_at,updated_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: duplicate } = await client
        .from("posts")
        .select("id")
        .eq("zerostorage_file_id", fileId)
        .maybeSingle();
      throw new Error(`Already imported${duplicate ? `. Existing post ID: ${duplicate.id}.` : "."}`);
    }
    throw new Error(`Could not link post: ${error.message}`);
  }

  if (input.style_ids?.length) {
    const { error: styleError } = await client.from("post_styles").insert(
      [...new Set(input.style_ids)].map((styleId) => ({
        post_id: data.id,
        style_id: styleId,
      })),
    );
    if (styleError) {
      throw new Error(`Post was linked, but its styles were not saved: ${styleError.message}`);
    }
  }

  return {
    ...(data as Post),
    media_url: buildDownloadUrl(fileId),
    model: undefined,
    styles: [],
    like_count: 0,
    mmc_count: 0,
    comment_count: 0,
    liked_by_me: false,
    mmc_by_me: false,
  };
}

export async function updatePost(id: string, input: PostUpdate): Promise<Post> {
  const client = getSupabase();
  const { style_ids: styleIds, ...fields } = input;
  if ((fields.source === "wt" && fields.type === "image")
    || (fields.source && fields.source !== "wt" && fields.type === "video")) {
    throw new Error("CTele and EB posts must be images; WT posts must be videos.");
  }
  if (fields.zerostorage_file_id !== undefined) {
    const fileId = fields.zerostorage_file_id.trim();
    if (!fileId || fileId.length > 255) throw new Error("A valid ZeroStorage file ID is required.");
    const { data: duplicate, error: duplicateError } = await client
      .from("posts")
      .select("id")
      .eq("zerostorage_file_id", fileId)
      .neq("id", id)
      .maybeSingle();
    if (duplicateError) throw new Error(`Could not check for duplicate media: ${duplicateError.message}`);
    if (duplicate) throw new Error(`This ZeroStorage file is already linked to another post.`);
    fields.zerostorage_file_id = fileId;
  }
  const { data, error } = await client
    .from("posts")
    .update(fields)
    .eq("id", id)
    .select("id,model_id,content_source_id,type,zerostorage_file_id,filename,caption,source,source_path,published,created_at,updated_at")
    .single();
  if (error) throw new Error(`Could not update post: ${error.message}`);

  if (styleIds) {
    const { error: deleteError } = await client.from("post_styles").delete().eq("post_id", id);
    if (deleteError) throw new Error(`Post updated, but styles could not be changed: ${deleteError.message}`);
    if (styleIds.length) {
      const { error: insertError } = await client.from("post_styles").insert(
        [...new Set(styleIds)].map((styleId) => ({ post_id: id, style_id: styleId })),
      );
      if (insertError) throw new Error(`Post updated, but styles could not be changed: ${insertError.message}`);
    }
  }

  const updated = await getPost(id);
  return updated ?? (data as Post);
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await getSupabase().from("posts").delete().eq("id", id);
  if (error) throw new Error(`Could not delete post: ${error.message}`);
}

export async function listComments(postId: string): Promise<Comment[]> {
  const { data, error } = await getSupabase().rpc("get_post_comments", {
    p_post_id: postId,
  });
  if (error) throw new Error(`Could not load comments: ${error.message}`);
  return (data ?? []) as Comment[];
}

export async function createComment(postId: string, body: string): Promise<Comment[]> {
  const value = body.trim();
  if (!value || value.length > 2000) throw new Error("Comments must be between 1 and 2,000 characters.");
  const client = getSupabase();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) throw new Error("Sign in to comment.");
  const { error } = await client.from("comments").insert({
    user_id: authData.user.id,
    post_id: postId,
    body: value,
  });
  if (error) throw new Error(`Could not add comment: ${error.message}`);
  return listComments(postId);
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await getSupabase().from("comments").delete().eq("id", commentId);
  if (error) throw new Error(`Could not delete comment: ${error.message}`);
}

export async function changeModelForPost(id: string, modelId: string): Promise<void> {
  const { error } = await getSupabase().from("posts").update({ model_id: modelId }).eq("id", id);
  if (error) throw new Error(`Could not move post: ${error.message}`);
}

export type { ContentSource };