export type UserRole = "user" | "admin" | "models";
export type MediaType = "image" | "video";
export type ContentSource = "ctele" | "eb" | "wt";

export interface Profile {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Model {
  id: string;
  name: string;
  username: string | null;
  slug: string;
  description: string | null;
  profile_image_url: string | null;
  profile_image_zerostorage_file_id: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
  styles?: Style[];
  post_count?: number;
}

export interface Style {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Post {
  id: string;
  model_id: string;
  content_source_id: string | null;
  type: MediaType;
  zerostorage_file_id: string;
  filename: string | null;
  caption: string | null;
  source: ContentSource;
  source_path: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
  /** Derived from zerostorage_file_id for display; never persisted as post identity. */
  media_url?: string;
  model?: Model;
  styles?: Style[];
  like_count: number;
  mmc_count: number;
  comment_count: number;
  liked_by_me: boolean;
  mmc_by_me: boolean;
}

export interface ModelDetail extends Model {
  styles: Style[];
  posts: Post[];
  image_count: number;
  video_count: number;
  followed: boolean;
}

export interface StyleDetail extends Style {
  models: Model[];
  posts: Post[];
}

export interface Comment {
  id: string;
  user_id: string;
  post_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
}

export interface PostStats {
  post_id: string;
  like_count: number;
  mmc_count: number;
  comment_count: number;
  liked_by_me: boolean;
  mmc_by_me: boolean;
}

export interface ModelInput {
  name: string;
  username?: string | null;
  slug: string;
  description?: string | null;
  profile_image_url?: string | null;
  profile_image_zerostorage_file_id?: string | null;
  published: boolean;
}

export interface PostInput {
  model_id: string;
  content_source_id?: string | null;
  type: MediaType;
  zerostorage_file_id: string;
  filename?: string | null;
  caption?: string | null;
  source: ContentSource;
  source_path?: string | null;
  published: boolean;
  style_ids?: string[];
}

export type PostUpdate = Partial<
  Pick<
    Post,
    | "caption"
    | "published"
    | "model_id"
    | "type"
    | "source"
    | "source_path"
    | "filename"
    | "zerostorage_file_id"
  >
> & { style_ids?: string[] };