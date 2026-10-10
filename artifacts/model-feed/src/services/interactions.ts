import type { PostStats } from "../types/models";
import { getSupabase } from "./supabase";

export interface ToggleResult {
  active: boolean;
  count: number;
}

export async function postStats(postIds: string[]): Promise<Map<string, PostStats>> {
  if (postIds.length === 0) return new Map();
  const uniqueIds = [...new Set(postIds)].slice(0, 100);
  const { data, error } = await getSupabase().rpc("get_post_stats", {
    post_ids: uniqueIds,
  });
  if (error) throw new Error(`Could not load post activity: ${error.message}`);
  return new Map(
    ((data ?? []) as PostStats[]).map((item) => [
      item.post_id,
      {
        ...item,
        like_count: Number(item.like_count),
        mmc_count: Number(item.mmc_count),
        comment_count: Number(item.comment_count),
      },
    ]),
  );
}

async function togglePostReaction(
  table: "likes" | "mmcs",
  postId: string,
  label: string,
): Promise<ToggleResult> {
  const client = getSupabase();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) throw new Error(`Sign in to ${label.toLowerCase()} posts.`);
  const userId = authData.user.id;
  const { data: existing, error: selectError } = await client
    .from(table)
    .select("post_id")
    .eq("user_id", userId)
    .eq("post_id", postId)
    .maybeSingle();
  if (selectError) throw new Error(`Could not check ${label.toLowerCase()} status: ${selectError.message}`);

  let active: boolean;
  if (existing) {
    const { error } = await client
      .from(table)
      .delete()
      .eq("user_id", userId)
      .eq("post_id", postId);
    if (error) throw new Error(`Could not remove ${label.toLowerCase()}: ${error.message}`);
    active = false;
  } else {
    const { error } = await client.from(table).insert({ user_id: userId, post_id: postId });
    if (error) throw new Error(`Could not add ${label.toLowerCase()}: ${error.message}`);
    active = true;
  }

  const { data: stats, error: statsError } = await client.rpc("get_post_stats", {
    post_ids: [postId],
  });
  if (statsError) throw new Error(`Updated ${label.toLowerCase()}, but could not refresh the count.`);
  const row = ((stats ?? []) as PostStats[])[0];
  return {
    active,
    count: table === "likes" ? Number(row?.like_count ?? 0) : Number(row?.mmc_count ?? 0),
  };
}

export function toggleLike(postId: string): Promise<ToggleResult> {
  return togglePostReaction("likes", postId, "Like");
}

export function toggleMMC(postId: string): Promise<ToggleResult> {
  return togglePostReaction("mmcs", postId, "MMC");
}

export async function toggleSave(postId: string): Promise<ToggleResult> {
  const client = getSupabase();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) throw new Error("Sign in to save posts.");
  const userId = authData.user.id;
  const { data: existing, error: selectError } = await client
    .from("saved_posts")
    .select("post_id")
    .eq("user_id", userId)
    .eq("post_id", postId)
    .maybeSingle();
  if (selectError) throw new Error(`Could not check saved status: ${selectError.message}`);

  let active: boolean;
  if (existing) {
    const { error } = await client
      .from("saved_posts")
      .delete()
      .eq("user_id", userId)
      .eq("post_id", postId);
    if (error) throw new Error(`Could not unsave post: ${error.message}`);
    active = false;
  } else {
    const { error } = await client.from("saved_posts").insert({ user_id: userId, post_id: postId });
    if (error) throw new Error(`Could not save post: ${error.message}`);
    active = true;
  }
  return { active, count: 0 };
}

export async function getSavedPostIds(): Promise<string[]> {
  const client = getSupabase();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return [];
  const userId = authData.user.id;
  const { data, error } = await client
    .from("saved_posts")
    .select("post_id")
    .eq("user_id", userId);
  if (error) throw new Error(`Could not load saved posts: ${error.message}`);
  return (data ?? []).map((row: { post_id: string }) => row.post_id);
}