import type { User } from "@supabase/supabase-js";
import type { Profile } from "../types/models";
import { getSupabase } from "./supabase";

export async function getAuthUser(): Promise<User | null> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    throw new Error(`Could not check your sign-in: ${error.message}`);
  }
  return data.user;
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}

export async function getMyProfile(): Promise<Profile | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const { data, error } = await getSupabase()
    .from("profiles")
    .select("id,display_name,username,avatar_url,role,created_at,updated_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load your profile: ${error.message}`);
  return data as Profile | null;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(`Sign-in failed: ${error.message}`);
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
): Promise<boolean> {
  const { data, error } = await getSupabase().auth.signUp({
    email: email.trim(),
    password,
    options: { data: { display_name: displayName.trim() } },
  });
  if (error) throw new Error(`Account creation failed: ${error.message}`);
  return Boolean(data.session);
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw new Error(`Sign-out failed: ${error.message}`);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: new URL("/me", window.location.origin).toString(),
  });
  if (error) throw new Error(`Could not send the password reset email: ${error.message}`);
}

export async function updateMyProfile(input: {
  display_name?: string;
  username?: string | null;
  avatar_url?: string | null;
}): Promise<Profile> {
  const user = await getAuthUser();
  if (!user) throw new Error("Sign in to update your profile.");
  const { data, error } = await getSupabase()
    .from("profiles")
    .update(input)
    .eq("id", user.id)
    .select("id,display_name,username,avatar_url,role,created_at,updated_at")
    .single();
  if (error) throw new Error(`Could not update your profile: ${error.message}`);
  return data as Profile;
}