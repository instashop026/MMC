import { getSupabase } from "./supabase";
import type { Style } from "../types/models";

async function currentUserId(): Promise<string> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error || !data.user) throw new Error("Sign in to follow models.");
  return data.user.id;
}

export async function getFollowedModelIds(): Promise<string[]> {
  const { data: authData, error: authError } = await getSupabase().auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") {
    throw new Error(`Could not verify your sign-in: ${authError.message}`);
  }
  if (!authData.user) return [];
  const userId = authData.user.id;
  const { data, error } = await getSupabase()
    .from("follows")
    .select("model_id")
    .eq("user_id", userId);
  if (error) throw new Error(`Could not load followed models: ${error.message}`);
  return (data ?? []).map((row) => row.model_id as string);
}

export async function toggleFollow(modelId: string): Promise<boolean> {
  const client = getSupabase();
  const userId = await currentUserId();
  const { data: existing, error: selectError } = await client
    .from("follows")
    .select("model_id")
    .eq("user_id", userId)
    .eq("model_id", modelId)
    .maybeSingle();
  if (selectError) throw new Error(`Could not check follow status: ${selectError.message}`);

  if (existing) {
    const { error } = await client
      .from("follows")
      .delete()
      .eq("user_id", userId)
      .eq("model_id", modelId);
    if (error) throw new Error(`Could not unfollow model: ${error.message}`);
    return false;
  }

  const { error } = await client.from("follows").insert({ user_id: userId, model_id: modelId });
  if (error) throw new Error(`Could not follow model: ${error.message}`);
  return true;
}

export async function getFollowedStyleIds(): Promise<string[]> {
  const { data: authData, error: authError } = await getSupabase().auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") {
    throw new Error(`Could not verify your sign-in: ${authError.message}`);
  }
  if (!authData.user) return [];
  const userId = authData.user.id;
  const { data, error } = await getSupabase()
    .from("style_follows")
    .select("style_id")
    .eq("user_id", userId);
  if (error) throw new Error(`Could not load followed styles: ${error.message}`);
  return (data ?? []).map((row) => row.style_id as string);
}

export async function toggleStyleFollow(styleId: string): Promise<boolean> {
  const client = getSupabase();
  const userId = await currentUserId();
  const { data: existing, error: selectError } = await client
    .from("style_follows")
    .select("style_id")
    .eq("user_id", userId)
    .eq("style_id", styleId)
    .maybeSingle();
  if (selectError) throw new Error(`Could not check style follow status: ${selectError.message}`);

  if (existing) {
    const { error } = await client
      .from("style_follows")
      .delete()
      .eq("user_id", userId)
      .eq("style_id", styleId);
    if (error) throw new Error(`Could not unfollow style: ${error.message}`);
    return false;
  }
  const { error } = await client
    .from("style_follows")
    .insert({ user_id: userId, style_id: styleId });
  if (error) throw new Error(`Could not follow style: ${error.message}`);
  return true;
}

export async function listFollowedStyles(): Promise<Style[]> {
  const ids = await getFollowedStyleIds();
  if (ids.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("styles")
    .select("id,name,slug,created_at")
    .in("id", ids);
  if (error) throw new Error(`Could not load followed styles: ${error.message}`);
  return (data ?? []) as Style[];
}