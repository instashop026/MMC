import {
  getAuthUser, onAuthChange, getMyProfile, signIn, signUp, signOut, sendPasswordReset,
} from './services/auth';
import {
  listModels, listFollowedModels, getModelDetail, createModel, updateModel, removeModel, setModelStyles,
} from './services/models';
import {
  toggleFollow, getFollowedModelIds, toggleStyleFollow, getFollowedStyleIds, listFollowedStyles,
} from './services/follows';
import {
  listPosts, getPost, createPost, updatePost, deletePost, listComments, createComment, deleteComment, findImportedFileIds,
} from './services/posts';
import { toggleLike, toggleMMC } from './services/interactions';
import {
  listStyles, getStyleDetail, createStyle, updateStyle, deleteStyle, findOrCreateStyle, normalizeStyleSlug,
} from './services/styles';
import {
  collectMediaUnderFolder, listFiles, listFolders,
  revalidateZeroStorageFiles, sourceForPath,
} from './services/zerostorage';
import type {
  ZeroFile, ZeroFolder, ZeroStorageImportFile, ZeroStorageSelectedFolder,
} from './services/zerostorage';
import {
  renderAdminImport, renderImportReview, renderZeroStorageBrowser,
} from './components/admin-views';
import type {
  ImportReviewGroup, ImportReviewVideo, ImportReviewState, ZeroStorageBrowserState,
} from './components/admin-views';
import { buildImageEmbedUrl, buildVideoEmbedUrl, buildDownloadUrl } from './lib/zerostorage-urls';
import { captionFromFilename, styleTagsFromFilename } from './lib/import-metadata';
import type { ContentSource, MediaType } from './types/models';

type AnyRecord = Record<string, any>;
type Route = { path: string; segments: string[]; query: URLSearchParams };
type ImportMode = 'profile' | 'gallery' | 'video' | 'post';

interface StorageBrowserSession {
  mode: ImportMode;
  purpose: 'profile' | 'bulk' | 'post';
  rootFolder: ZeroFolder;
  stack: ZeroFolder[];
  folders: ZeroFolder[];
  files: ZeroFile[];
  selectedFiles: ZeroStorageImportFile[];
  selectedFolders: ZeroStorageSelectedFolder[];
  page: number;
  folderTotal: number;
  fileTotal: number;
  loading: boolean;
  error?: string;
  requestId: number;
}

interface ImportReviewDraft extends ImportReviewState {
  modelId: string;
  purpose: 'profile' | 'bulk';
  groupFiles: Record<string, ZeroStorageImportFile[]>;
  videoFiles: ZeroStorageImportFile[];
  videoTags: Record<string, string[]>;
}

const state: {
  user: unknown; profile: unknown; route: Route; search: string; filterType: string; filterModel: string;
  followed: Set<string>; followedStyles: Set<string>; modal: string; modalData: AnyRecord;
  error: string; toastTimer?: number; styles: AnyRecord[]; generation: number;
  importModelId: string; storageBrowser: StorageBrowserSession | null; importReview: ImportReviewDraft | null;
} = {
  user: null, profile: null, route: parseRoute(), search: '', filterType: '', filterModel: '',
  followed: new Set(), followedStyles: new Set(), modal: '', modalData: {}, error: '',
  styles: [], generation: 0,
  importModelId: '', storageBrowser: null, importReview: null,
};

const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing application root.');

function parseRoute(): Route {
  return { path: location.pathname.replace(/\/+$/, '') || '/', segments: location.pathname.split('/').filter(Boolean), query: new URLSearchParams(location.search) };
}
function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
function str(obj: unknown, ...keys: string[]): string {
  const o = obj as AnyRecord | null;
  for (const key of keys) if (o && o[key] !== undefined && o[key] !== null) return String(o[key]);
  return '';
}
function bool(obj: unknown, ...keys: string[]): boolean {
  const o = obj as AnyRecord | null;
  for (const key of keys) if (o && o[key] !== undefined) return Boolean(o[key]);
  return false;
}
function hasAny(obj: unknown, ...keys: string[]): boolean {
  const o = obj as AnyRecord | null;
  return !!o && keys.some(key => o[key] !== undefined && o[key] !== null);
}
function publicPosts(posts: AnyRecord[]): AnyRecord[] {
  return isAdmin() ? posts : posts.filter(p => !hasAny(p, 'published', 'is_published', 'isPublished') || bool(p, 'published', 'is_published', 'isPublished'));
}
function publicModels(models: AnyRecord[]): AnyRecord[] {
  return isAdmin() ? models : models.filter(m => !hasAny(m, 'published', 'is_published', 'isPublished') || bool(m, 'published', 'is_published', 'isPublished'));
}
function num(obj: unknown, ...keys: string[]): number {
  const raw = str(obj, ...keys);
  return Number(raw) || 0;
}
function list(v: unknown): any[] {
  if (Array.isArray(v)) return v as any[];
  const o = v as AnyRecord | null;
  if (o && Array.isArray(o.items)) return o.items;
  if (o && Array.isArray(o.data)) return o.data;
  if (o && Array.isArray(o.results)) return o.results;
  return [];
}
function idOf(o: unknown): string { return str(o, 'id', 'uuid'); }
function modelName(o: unknown): string { return str(o, 'display_name', 'displayName', 'name', 'title') || 'Untitled model'; }
function modelSlug(o: unknown): string { return str(o, 'slug') || idOf(o); }
function postCaption(o: unknown): string { return str(o, 'caption', 'description', 'title'); }
function mediaUrl(o: unknown): string {
  const direct = str(o, 'media_url', 'mediaUrl', 'url', 'file_url', 'fileUrl', 'storage_url', 'storageUrl', 'path');
  if (direct) return direct;
  const fileId = str(o, 'zerostorage_file_id', 'zerostorageFileId');
  if (!fileId) return '';
  return isVideo(o) ? buildVideoEmbedUrl(fileId) : buildDownloadUrl(fileId);
}
function modelImageUrl(o: unknown): string {
  const fileId = str(o, 'profile_image_zerostorage_file_id', 'profileImageZeroStorageFileId');
  if (fileId) return buildDownloadUrl(fileId);
  return str(o, 'profile_image_url', 'profileImageUrl', 'cover_url', 'coverUrl', 'avatar_url', 'avatarUrl', 'image_url', 'imageUrl');
}
function isVideo(o: unknown): boolean {
  return /video/i.test(str(o, 'type', 'media_type', 'mediaType'))
    || /\.(mp4|m4v|webm|mov|mkv|avi|wmv|flv)(\?|$)/i.test(str(o, 'filename', 'name', 'media_url', 'mediaUrl', 'url'));
}
function icon(name: string): string {
  const paths: Record<string, string> = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    explore: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    models: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z"/>',
    comment: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>',
    close: '<path d="m18 6-12 12M6 6l12 12"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ''}</svg>`;
}
function go(path: string): void {
  history.pushState({}, '', path);
  state.route = parseRoute(); state.error = ''; window.scrollTo(0, 0); void render();
}
function toast(message: string): void {
  const old = document.querySelector('.toast'); old?.remove();
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = message;
  document.body.append(el);
  window.clearTimeout(state.toastTimer); state.toastTimer = window.setTimeout(() => el.remove(), 3000);
}
function userError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (/column .*profile_image_zerostorage_file_id.*does not exist|profile_image_zerostorage_file_id.*(?:does not exist|schema cache)/i.test(msg)) {
    return 'Apply Supabase migration 003_model_zerostorage_profile_image.sql, then reload the app.';
  }
  if (/schema cache|could not find the table|relation .* does not exist|PGRST205/i.test(msg)) {
    return 'The Supabase tables are not set up yet. Apply the SQL migrations in supabase/migrations/ in numeric order.';
  }
  if (/fetch|network|load failed/i.test(msg)) return 'A network connection could not be reached. Check your connection and try again.';
  if (/supabase|url|key|config|environment/i.test(msg)) return 'The service is not configured yet. Please try again later or contact the administrator.';
  return msg || 'Something went wrong. Please try again.';
}
function actionError(err: unknown): void { toast(userError(err)); }
function dateText(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}
function stateBlock(kind: 'loading' | 'error' | 'empty', message = ''): string {
  if (kind === 'loading') return `<div class="loading-card" aria-label="Loading content"><div class="skeleton"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>`;
  if (kind === 'error') return `<section class="error-state" role="alert"><p>${esc(message)}</p><button class="btn btn-small" data-action="retry">Try again</button></section>`;
  return `<section class="empty-state"><div class="empty-mark" aria-hidden="true">—</div><h2>Nothing here yet</h2><p>${esc(message || 'When there is something to see, it will appear here.')}</p></section>`;
}
function navItem(path: string, label: string, ico: string): string {
  const active = state.route.path === path || (path !== '/' && state.route.path.startsWith(path));
  return `<button class="nav-item ${active ? 'active' : ''}" data-go="${path}" aria-label="${label}" ${active ? 'aria-current="page"' : ''}>${icon(ico)}<span>${label}</span></button>`;
}
function shell(content: string): string {
  const admin = isAdmin();
  const showError = state.error && !content.includes('class="error-state"');
  return `<div class="shell"><div class="phone-column"><header class="topbar"><a href="/" class="wordmark" data-go="/">Model Feed</a><div class="top-actions">${admin ? `<button class="plain-button small" data-go="/admin">Admin</button>` : ''}<button class="icon-button" data-go="/me" aria-label="Your account">${icon('profile')}</button></div></header>${showError ? `<div class="notice error-notice" role="alert">${esc(state.error)}</div>` : ''}<main class="page">${content}</main><nav class="bottom-nav" aria-label="Primary navigation">${navItem('/', 'Feed', 'home')}${navItem('/explore', 'Explore', 'explore')}${navItem('/models', 'Models', 'models')}${navItem('/me', 'You', 'profile')}</nav></div></div>${modalMarkup()}${adminOverlayMarkup()}`;
}
function isAdmin(): boolean {
  const p = state.profile as AnyRecord | null;
  return String(p?.role ?? '').toLowerCase() === 'admin';
}
function heading(kicker: string, title: string, intro = ''): string {
  return `<header class="page-head"><span class="eyebrow">${esc(kicker)}</span><h1>${esc(title)}</h1>${intro ? `<p class="page-intro">${esc(intro)}</p>` : ''}</header>`;
}
function postCard(p: AnyRecord): string {
  const id = idOf(p), media = mediaUrl(p), model = (p.model ?? p.models ?? {}) as AnyRecord;
  const title = modelName(model) || str(p, 'model_name', 'modelName') || 'Creator';
  const slug = modelSlug(model) || str(p, 'model_slug', 'modelSlug');
  const activeLike = bool(p, 'liked_by_me', 'likedByMe', 'is_liked', 'isLiked', 'liked');
  const activeMmc = bool(p, 'mmc_by_me', 'mmcByMe', 'is_mmc', 'isMmc', 'mmc');
  const comments = num(p, 'comment_count', 'commentCount');
  const likes = num(p, 'like_count', 'likeCount', 'likes_count');
  const mmcs = num(p, 'mmc_count', 'mmcCount');
  const mediaHtml = media ? (isVideo(p)
    ? `<video data-feed-video muted playsinline preload="none" tabindex="0" data-src="${esc(media)}" aria-label="Video by ${esc(title)}. Activate to pause or play."></video>`
    : `<img loading="lazy" src="${esc(media)}" alt="${esc(str(p, 'alt_text', 'altText') || `Post by ${title}`)}" data-fullscreen="${esc(media)}" data-kind="image" role="button" tabindex="0" aria-label="Open image fullscreen">`)
    : `<div class="media-placeholder"><span>Media unavailable</span></div>`;
  return `<article class="post-card" data-post-card="${esc(id)}"><div class="post-meta"><a class="avatar" href="/models/${esc(slug)}" data-go="/models/${esc(slug)}" aria-label="${esc(title)}">${esc(title.trim().slice(0,1).toUpperCase())}</a><div><a class="meta-name" href="/models/${esc(slug)}" data-go="/models/${esc(slug)}">${esc(title)}</a><div class="meta-sub">${esc(dateText(str(p, 'created_at', 'createdAt', 'published_at', 'publishedAt')) || 'Recently added')}</div></div><span class="meta-spacer"></span>${str(p, 'type') ? `<span class="chip">${esc(str(p, 'type'))}</span>` : ''}</div><div class="media-frame">${mediaHtml}</div>${postCaption(p) ? `<div class="post-copy"><p>${esc(postCaption(p))}</p></div>` : ''}<div class="post-actions"><button class="action ${activeLike ? 'active-like' : ''}" data-action="like" data-id="${esc(id)}" aria-pressed="${activeLike}">${icon('heart')}<span class="count">${likes || ''}</span><span>Like</span></button><button class="action ${activeMmc ? 'active-mmc' : ''}" data-action="mmc" data-id="${esc(id)}" aria-pressed="${activeMmc}"><span aria-hidden="true">MMC</span><span class="count">${mmcs || ''}</span></button><button class="action" data-action="comments" data-id="${esc(id)}">${icon('comment')}<span>${comments || 'Comment'}</span></button><span class="meta-spacer"></span></div></article>`;
}
function modelCard(m: AnyRecord): string {
  const name = modelName(m), slug = modelSlug(m);
  const image = modelImageUrl(m);
  const followerIds = state.followed;
  const following = followerIds.has(idOf(m)) || bool(m, 'is_following', 'isFollowing', 'following');
  return `<article class="model-tile"><a href="/models/${esc(slug)}" data-go="/models/${esc(slug)}"><div class="model-image">${image ? `<img loading="lazy" src="${esc(image)}" alt="${esc(name)}">` : `<div class="media-placeholder"><span>${esc(name.slice(0,1).toUpperCase())}</span></div>`}</div><div class="model-info"><strong>${esc(name)}</strong><small>${esc(str(m, 'tagline', 'location', 'username', 'handle') || 'Creator')}</small></div></a><div class="model-info" style="padding-top:0"><button class="btn btn-outline btn-small btn-block" data-action="follow" data-id="${esc(idOf(m))}" aria-pressed="${following}">${following ? 'Following' : 'Follow'}</button></div></article>`;
}
function searchField(placeholder: string): string {
  return `<div class="search-box"><input type="search" value="${esc(state.search)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" data-search></div>`;
}
async function loadPosts(args: {limit:number;offset:number;modelId?:string;type?:MediaType;search?:string}): Promise<AnyRecord[]> {
  return list(await listPosts(args));
}
async function loadModels(search = '', limit = 60): Promise<AnyRecord[]> {
  return list(await listModels({ search: search || undefined, limit, offset: 0 }));
}
async function pageFeed(): Promise<string> {
  const posts = publicPosts(await loadPosts({ limit: 1000, offset: 0, search: state.search || undefined }));
  return `${heading('A closer look', 'The feed', 'Recent work from across the creator community.')}${searchField('Search the feed')}<div class="feed">${posts.length ? posts.map(postCard).join('') : stateBlock('empty', 'New posts will appear here.')}</div>`;
}
async function pageExplore(): Promise<string> {
  const [posts, models, styles] = await Promise.all([loadPosts({limit:24,offset:0,search:state.search || undefined}), loadModels(state.search), listStyles({limit:24,offset:0})]);
  const visiblePosts = publicPosts(posts);
  const visibleModels = publicModels(models);
  const styleItems=list(styles);
  return `${heading('Find your point of view', 'Explore', 'A considered collection of new work from across the community.')}${searchField('Search creators or posts')}<div class="section-title"><h2>Creators</h2><a href="/models" data-go="/models">All models</a></div>${visibleModels.length ? `<div class="model-grid">${visibleModels.slice(0,4).map(modelCard).join('')}</div>` : stateBlock('empty','New creator profiles will appear here.')}<div class="section-title"><h2>Styles</h2><a href="/styles" data-go="/styles">Browse all</a></div><div class="chips">${styleItems.slice(0,6).map(s=>`<a class="chip" href="/styles/${esc(str(s,'slug')||idOf(s))}" data-go="/styles/${esc(str(s,'slug')||idOf(s))}">${esc(str(s,'name','title'))}</a>`).join('') || '<span class="muted small">No styles yet.</span>'}</div><div class="section-title"><h2>Recent posts</h2></div><div class="feed">${visiblePosts.length ? visiblePosts.map(postCard).join('') : stateBlock('empty','New posts will appear here.')}</div>`;
}
async function pageModels(): Promise<string> {
  const models = publicModels(await loadModels(state.search));
  return `${heading('People to know', 'Models', 'Follow the creators whose work you want to return to.')}${searchField('Search models')}<div class="model-grid">${models.length ? models.map(modelCard).join('') : stateBlock('empty','Try another search, or check back soon.')}</div>`;
}
async function pageModel(slug: string): Promise<string> {
  const model = await getModelDetail(slug);
  if (!model) throw new Error('This creator profile could not be found.');
  if (!isAdmin() && hasAny(model,'published','is_published','isPublished') && !bool(model,'published','is_published','isPublished')) throw new Error('This creator profile is not available.');
  const id = idOf(model), posts = publicPosts(await loadPosts({limit:1000,offset:0,modelId:id}));
  const name = modelName(model), followed = state.followed.has(id) || bool(model,'is_following','isFollowing','following');
  const image = modelImageUrl(model);
  const styles = Array.isArray(model.styles) ? model.styles as AnyRecord[] : [];
  return `<section class="model-profile">${image ? `<img class="avatar" style="object-fit:cover" src="${esc(image)}" alt="${esc(name)}">` : `<div class="avatar">${esc(name.slice(0,1).toUpperCase())}</div>`}<div style="flex:1"><span class="eyebrow">Creator</span><h1>${esc(name)}</h1><span class="muted small">${esc(str(model,'location','handle'))}</span></div><button class="btn btn-outline btn-small" data-action="follow" data-id="${esc(id)}" aria-pressed="${followed}">${followed?'Following':'Follow'}</button></section><p class="model-bio">${esc(str(model,'bio','description'))}</p>${styles.length ? `<div class="chips spacer-top">${styles.map(s=>`<a class="chip" href="/styles/${esc(str(s,'slug')||idOf(s))}" data-go="/styles/${esc(str(s,'slug')||idOf(s))}">${esc(str(s,'name','title'))}</a>`).join('')}</div>`:''}<div class="section-title"><h2>Posts</h2><span class="muted small">${posts.length} shared</span></div><div class="feed">${posts.length ? posts.map(postCard).join('') : stateBlock('empty','This creator has not shared any posts yet.')}</div>`;
}
async function pageStyles(): Promise<string> {
  const styles = list(await listStyles({limit:100,offset:0}));
  return `${heading('A language of its own', 'Styles', 'Browse work by mood, medium and point of view.')}<div class="table-list">${styles.length ? styles.map(s=>`<a class="admin-link" href="/styles/${esc(str(s,'slug')||idOf(s))}" data-go="/styles/${esc(str(s,'slug')||idOf(s))}"><span>${esc(str(s,'name','title'))}</span><small>${esc(str(s,'description'))}</small></a>`).join('') : stateBlock('empty','Styles will appear here once they are added.')}</div>`;
}
async function pageStyle(slug: string): Promise<string> {
  const style = await getStyleDetail(slug) as AnyRecord;
  if (!style) throw new Error('This style could not be found.');
  const models = Array.isArray(style.models) ? style.models as AnyRecord[] : [];
  const posts = publicPosts(Array.isArray(style.posts) ? style.posts as AnyRecord[] : []);
  const following = state.followedStyles.has(idOf(style));
  return `${heading('Style',str(style,'name','title') || 'Style')}<div class="row-between spacer-top"><p class="page-intro">A collection of posts and creators with a shared point of view.</p><button class="btn btn-outline btn-small" data-action="style-follow" data-id="${esc(idOf(style))}" aria-pressed="${following}">${following?'Following style':'Follow style'}</button></div><div class="section-title"><h2>Creators in this style</h2></div><div class="model-grid">${models.length ? models.map(modelCard).join('') : stateBlock('empty','No creators are linked to this style yet.')}</div><div class="section-title"><h2>Posts in this style</h2></div><div class="feed">${posts.length ? posts.map(postCard).join('') : stateBlock('empty','No posts are linked to this style yet.')}</div>`;
}
async function pagePost(id: string): Promise<string> {
  const p = await getPost(id);
  if (!p) throw new Error('This post could not be found.');
  return `${heading('From the feed','Post')}${postCard(p)}<div class="row-between spacer-top"><button class="btn btn-outline btn-small" data-action="comments" data-id="${esc(id)}">Read and add comments</button><button class="plain-button small" data-go="/">Back to feed</button></div>`;
}
async function profilePage(): Promise<string> {
  if (!state.user) return authPage();
  const p = state.profile as AnyRecord | null;
  const [models, styles] = await Promise.all([
    listFollowedModels(),
    listFollowedStyles(),
  ]);
  const followedModels=publicModels(models).filter(m=>state.followed.has(idOf(m)));
  return `${heading('Your space','Account',str(p,'display_name','displayName','name') ? `Signed in as ${str(p,'display_name','displayName','name')}` : 'Your account and followed creators.')}${isAdmin() ? `<div class="admin-links"><a class="admin-link" href="/admin" data-go="/admin"><span>Administration</span><small>Manage catalog →</small></a></div>`:''}<div class="section-title"><h2>Following</h2><a href="/models" data-go="/models">Discover</a></div>${followedModels.length?`<div class="model-grid">${followedModels.map(modelCard).join('')}</div>`:stateBlock('empty','Creators you follow will be gathered here.')}<div class="section-title spacer-top"><h2>Followed styles</h2><a href="/styles" data-go="/styles">Browse styles</a></div><div class="chips">${styles.map(s=>`<a class="chip" href="/styles/${esc(str(s,'slug')||idOf(s))}" data-go="/styles/${esc(str(s,'slug')||idOf(s))}">${esc(str(s,'name','title'))}</a>`).join('') || '<span class="muted small">Styles you follow will appear here.</span>'}</div><div class="spacer-top"><button class="btn btn-outline btn-block" data-action="signout">Sign out</button></div>`;
}
function authPage(): string {
  const tab = state.modalData.authMode || 'signin';
  return `${heading('An invitation to look closer','Your account','Sign in to follow creators, save moments and join the conversation.')}<div class="auth-wrap"><div class="auth-card"><div class="tabs"><button class="tab ${tab==='signin'?'selected':''}" data-action="auth-mode" data-mode="signin">Sign in</button><button class="tab ${tab==='signup'?'selected':''}" data-action="auth-mode" data-mode="signup">Create account</button></div>${state.modalData.authNotice?`<p class="notice" role="status">${esc(state.modalData.authNotice)}</p>`:''}<form data-form="auth"><input type="hidden" name="mode" value="${esc(tab)}">${tab==='signup'?`<div class="field"><label for="display-name">Display name</label><input id="display-name" name="displayName" autocomplete="name" required></div>`:''}<div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required></div><div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="${tab==='signin'?'current-password':'new-password'}" minlength="6" required></div><button class="btn btn-gold btn-block" type="submit">${tab==='signin'?'Sign in':'Create account'}</button></form>${tab==='signin'?`<button class="text-link spacer-top" data-action="reset-password">Forgot password?</button>`:''}</div></div>`;
}
async function pageAdmin(): Promise<string> {
  if (!state.user) return `${heading('Catalog desk','Administrator access','Sign in with an administrator account to manage the catalog.')}<button class="btn btn-gold" data-go="/me">Sign in</button>`;
  if (!isAdmin()) return `${heading('Catalog desk','Not authorized','Administration is available to accounts with the administrator role.')}<button class="btn btn-outline" data-go="/">Return to feed</button>`;
  return `${heading('Catalog desk','Administration','A quiet workspace for keeping the creator catalog current.')}<div class="admin-links"><a class="admin-link" href="/admin/models" data-go="/admin/models"><span>Models</span><small>Create and edit →</small></a><a class="admin-link" href="/admin/posts" data-go="/admin/posts"><span>Posts</span><small>Publish and curate →</small></a><a class="admin-link" href="/admin/styles" data-go="/admin/styles"><span>Styles</span><small>Create and edit →</small></a><a class="admin-link" href="/admin/import" data-go="/admin/import"><span>ZeroStorage import</span><small>Profiles, galleries and videos →</small></a></div>`;
}
async function pageAdminModels(): Promise<string> {
  if (!isAdmin()) return await pageAdmin();
  const models = await loadModels(state.search);
  return `${heading('Catalog desk','Manage models','Keep profiles and style relationships in good order.')}<div class="toolbar"><h2>Models</h2><button class="btn btn-gold btn-small" data-action="model-create">Add model</button></div>${searchField('Search models')}<div class="table-list">${models.length ? models.map(m=>`<article class="table-row"><div class="avatar">${esc(modelName(m).slice(0,1))}</div><div class="table-row-main"><strong>${esc(modelName(m))}</strong><small>${esc(str(m,'slug'))} · ${bool(m,'published','is_published','isPublished')?'Published':'Draft'}</small></div><button class="btn btn-outline btn-small" data-action="model-publish" data-id="${esc(idOf(m))}" data-published="${bool(m,'published','is_published','isPublished')}">${bool(m,'published','is_published','isPublished')?'Unpublish':'Publish'}</button><button class="btn btn-outline btn-small" data-action="model-edit" data-id="${esc(idOf(m))}">Edit</button><button class="btn btn-danger btn-small" data-action="model-delete" data-id="${esc(idOf(m))}" data-name="${esc(modelName(m))}">Delete</button></article>`).join('') : stateBlock('empty','Add a model profile to begin.')}</div>`;
}

async function pageAdminStyles(): Promise<string> {
  if (!isAdmin()) return await pageAdmin();
  const styles = list(await listStyles({ limit: 100, offset: 0 }));
  return `${heading('Catalog desk','Manage styles','Create and maintain the labels used to organize models and posts.')}<form class="style-create" data-form="style"><div class="field"><label for="style-name">New style name</label><input id="style-name" name="name" maxlength="80" required placeholder="For example, Editorial"></div><button class="btn btn-gold" type="submit">Add style</button></form><div class="table-list">${styles.length ? styles.map(s=>`<article class="table-row"><div class="table-row-main"><strong>${esc(str(s,'name'))}</strong><small>${esc(str(s,'slug'))}</small></div><button class="btn btn-outline btn-small" data-action="style-edit" data-id="${esc(idOf(s))}" data-name="${esc(str(s,'name'))}">Rename</button><button class="btn btn-danger btn-small" data-action="style-delete" data-id="${esc(idOf(s))}" data-name="${esc(str(s,'name'))}">Delete</button></article>`).join('') : stateBlock('empty','Add a style to begin.')}</div>`;
}
async function pageAdminPosts(): Promise<string> {
  if (!isAdmin()) return await pageAdmin();
  const posts = await loadPosts({limit:80,offset:0,search:state.search || undefined, modelId:state.filterModel || undefined, type:state.filterType==='image'?'image':state.filterType==='video'?'video':undefined});
  return `${heading('Catalog desk','Manage posts','Review media, control visibility and keep the feed considered.')}<div class="toolbar"><h2>Posts</h2><div class="row"><button class="btn btn-outline btn-small" data-go="/admin/import">Import from ZeroStorage</button><button class="btn btn-gold btn-small" data-action="post-create">Add post</button></div></div>${searchField('Search captions')}<div class="filter-row"><select class="filter-select" data-filter="type" aria-label="Filter by media type"><option value="">All types</option><option value="image" ${state.filterType==='image'?'selected':''}>Images</option><option value="video" ${state.filterType==='video'?'selected':''}>Videos</option></select><select class="filter-select" data-filter="model" aria-label="Filter by model"><option value="">All models</option>${(await loadModels()).map(m=>`<option value="${esc(idOf(m))}" ${state.filterModel===idOf(m)?'selected':''}>${esc(modelName(m))}</option>`).join('')}</select></div><div class="table-list">${posts.length ? posts.map(p=>`<article class="table-row"><div class="table-row-main"><strong>${esc(postCaption(p)||'Untitled post')}</strong><small>${esc(modelName((p.model??p.models??{}) as AnyRecord))} · ${bool(p,'published','is_published','isPublished')?'Published':'Draft'}</small></div><button class="btn btn-outline btn-small" data-action="post-publish" data-id="${esc(idOf(p))}" data-published="${bool(p,'published','is_published','isPublished')}">${bool(p,'published','is_published','isPublished')?'Unpublish':'Publish'}</button><button class="btn btn-outline btn-small" data-action="post-edit" data-id="${esc(idOf(p))}">Edit</button><button class="btn btn-danger btn-small" data-action="post-delete" data-id="${esc(idOf(p))}">Delete</button></article>`).join('') : stateBlock('empty','No posts match these filters.')}</div>`;
}
async function pageImport(): Promise<string> {
  if (!isAdmin()) return await pageAdmin();
  const models = await loadModels('', 100);
  if (!models.some((model) => idOf(model) === state.importModelId)) state.importModelId = '';
  return renderAdminImport({
    models: models.map((model) => ({ id: idOf(model), name: modelName(model) })),
    selectedModelId: state.importModelId,
  });
}
async function page(route: Route): Promise<string> {
  const s = route.segments;
  if (route.path === '/') return pageFeed();
  if (route.path === '/explore') return pageExplore();
  if (route.path === '/models') return pageModels();
  if (s[0] === 'models' && s.length === 2) return pageModel(decodeURIComponent(s[1]));
  if (route.path === '/styles') return pageStyles();
  if (s[0] === 'styles' && s.length === 2) return pageStyle(decodeURIComponent(s[1]));
  if (route.path === '/me') return profilePage();
  if (s[0] === 'post' && s.length === 2) return pagePost(decodeURIComponent(s[1]));
  if (route.path === '/admin') return pageAdmin();
  if (route.path === '/admin/models') return pageAdminModels();
  if (route.path === '/admin/posts') return pageAdminPosts();
  if (route.path === '/admin/styles') return pageAdminStyles();
  if (route.path === '/admin/import') return pageImport();
  return `${heading('Not found','This page has wandered off.') }<button class="btn btn-outline" data-go="/">Return to the feed</button>`;
}
function modalMarkup(): string {
  if (!state.modal) return '';
  const d = state.modalData;
  if (state.modal === 'comments') return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="modal-head"><h2 id="dialog-title">Conversation</h2><button class="icon-button" data-action="close-modal" aria-label="Close">${icon('close')}</button></div><div class="comments">${d.loading?'<div class="skeleton-line"></div>':d.comments?.length?d.comments.map((c:AnyRecord)=>`<div class="comment"><div class="row-between"><strong>${esc(str(c,'display_name','displayName','author_name')||'Member')}</strong>${isAdmin()?`<button class="plain-button small" data-action="comment-delete" data-id="${esc(idOf(c))}">Remove</button>`:''}</div><p>${esc(str(c,'body','content','text'))}</p></div>`).join(''):`<p class="muted small">Be the first to leave a thoughtful note.</p>`}</div>${state.user?`<form data-form="comment"><input type="hidden" name="postId" value="${esc(d.postId)}"><div class="field"><label for="comment-body">Add a comment</label><textarea id="comment-body" name="body" maxlength="2000" required placeholder="Write something considered…"></textarea></div><button class="btn btn-gold btn-block" type="submit">Post comment</button></form>`:`<button class="btn btn-outline btn-block" data-go="/me">Sign in to comment</button>`}</section></div>`;
  if (state.modal === 'model-form') {
     const sourceModel = d.model || {};
     const draft = d.draft || {};
     const m = {
       ...sourceModel,
       name: draft.name ?? str(sourceModel,'display_name','displayName','name'),
       username: draft.username ?? str(sourceModel,'username'),
       slug: draft.slug ?? str(sourceModel,'slug'),
       description: draft.bio ?? str(sourceModel,'bio','description'),
       profile_image_url: draft.imageUrl ?? str(sourceModel,'avatar_url','avatarUrl','image_url','imageUrl','profile_image_url','profileImageUrl'),
       profile_image_zerostorage_file_id: draft.profileFileId ?? str(sourceModel,'profile_image_zerostorage_file_id','profileImageZeroStorageFileId'),
       published: draft.published ?? bool(sourceModel,'published','is_published','isPublished'),
       styleIds: draft.styleIds ?? [],
     };
     const profileFileId = str(m,'profile_image_zerostorage_file_id');
     const profilePreview = profileFileId ? buildDownloadUrl(profileFileId) : str(m,'profile_image_url');
      return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="modal-head"><h2 id="dialog-title">${d.edit?'Edit model':'New model'}</h2><button class="icon-button" data-action="close-modal" aria-label="Close">${icon('close')}</button></div><form data-form="model"><input type="hidden" name="id" value="${esc(idOf(m))}"><div class="field"><label for="m-name">Display name</label><input id="m-name" name="name" required value="${esc(str(m,'display_name','displayName','name'))}"></div><div class="field"><label for="m-username">Username (optional)</label><input id="m-username" name="username" value="${esc(str(m,'username'))}"></div><div class="field"><label for="m-slug">Slug</label><input id="m-slug" name="slug" required value="${esc(str(m,'slug'))}"></div><div class="field"><label for="m-bio">Bio</label><textarea id="m-bio" name="bio">${esc(str(m,'bio','description'))}</textarea></div><div class="field"><label for="m-cover">Profile image URL</label><input id="m-cover" name="imageUrl" type="url" value="${esc(str(m,'profile_image_url','profileImageUrl'))}"><input type="hidden" name="profileFileId" value="${esc(profileFileId)}"><button type="button" class="btn btn-outline btn-small" data-action="profile-image-select">Choose a single image from ZeroStorage</button>${profilePreview ? `<img class="profile-image-preview" src="${esc(profilePreview)}" alt="Profile image preview">` : ''}${profileFileId ? `<small class="muted profile-storage-file-id">ZeroStorage file ID: ${esc(profileFileId)}</small>` : ''}</div><div class="field"><label><input type="checkbox" name="published" ${bool(m,'published','is_published','isPublished')?'checked':''}> Published</label></div><div class="field"><label>Styles</label><div class="chips">${state.styles.map((st:AnyRecord)=>`<label class="chip"><input type="checkbox" name="styleIds" value="${esc(idOf(st))}" ${((Array.isArray(m.styles)&&m.styles.some((x:AnyRecord)=>idOf(x)===idOf(st)))||(Array.isArray(m.style_ids)&&m.style_ids.includes(idOf(st)))||(Array.isArray(m.styleIds)&&m.styleIds.includes(idOf(st))))?'checked':''}> ${esc(str(st,'name','title'))}</label>`).join('') || '<span class="muted small">Add styles first to attach them to a model.</span>'}</div></div><button class="btn btn-gold btn-block" type="submit">${d.edit?'Save changes':'Create model'}</button></form></section></div>`;
  }
  if (state.modal === 'post-form') {
    const savedPost = d.post || {};
    const draft = d.draft || {};
    const p = {
      ...savedPost,
      model_id: draft.modelId ?? str(savedPost, 'model_id', 'modelId'),
      caption: draft.caption ?? postCaption(savedPost),
      zerostorage_file_id: draft.fileId ?? str(savedPost, 'zerostorage_file_id', 'zerostorageFileId'),
      filename: draft.filename ?? str(savedPost, 'filename'),
      source: draft.source ?? str(savedPost, 'source'),
      source_path: draft.sourcePath ?? str(savedPost, 'source_path', 'sourcePath'),
      style_ids: draft.styleIds ?? savedPost.style_ids ?? [],
      published: draft.published ?? bool(savedPost, 'published', 'is_published', 'isPublished'),
    };
    const models = d.models || [];
    return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div class="modal-head"><h2 id="dialog-title">${d.edit ? 'Edit post' : 'New post'}</h2><button class="icon-button" data-action="close-modal" aria-label="Close">${icon('close')}</button></div>
      <form data-form="post">
        <input type="hidden" name="id" value="${esc(idOf(p))}">
        <div class="field"><label for="p-model">Model</label><select id="p-model" name="modelId" required><option value="">Choose a model</option>${models.map((m: AnyRecord) => `<option value="${esc(idOf(m))}" ${str(p, 'model_id', 'modelId') === idOf(m) || idOf(p.model) === idOf(m) ? 'selected' : ''}>${esc(modelName(m))}</option>`).join('')}</select></div>
        <div class="field"><label for="p-caption">Caption</label><textarea id="p-caption" name="caption">${esc(postCaption(p))}</textarea></div>
        <div class="field"><label for="p-file-id">ZeroStorage file ID</label><input id="p-file-id" name="fileId" maxlength="255" value="${esc(str(p, 'zerostorage_file_id', 'zerostorageFileId'))}" required><button type="button" class="btn btn-outline btn-small" data-action="post-media-select">Choose media from ZeroStorage</button></div>
        <div class="field"><label for="p-filename">Filename</label><input id="p-filename" name="filename" maxlength="255" value="${esc(str(p, 'filename'))}"></div>
        <div class="field"><label for="p-source">Content source</label><select id="p-source" name="source" required><option value="">Choose a source</option><option value="ctele" ${str(p, 'source') === 'ctele' ? 'selected' : ''}>CTele · images only</option><option value="eb" ${str(p, 'source') === 'eb' ? 'selected' : ''}>EB · images only</option><option value="wt" ${str(p, 'source') === 'wt' ? 'selected' : ''}>WT · videos only</option></select></div>
        <p class="muted small">Media type follows the source: CTele and EB files are images; WT files are videos.</p>
        <div class="field"><label for="p-source-path">Folder path (optional)</label><input id="p-source-path" name="sourcePath" maxlength="1000" value="${esc(str(p, 'source_path', 'sourcePath'))}"></div>
        <div class="field"><label>Styles</label><div class="chips">${state.styles.map((st: AnyRecord) => `<label class="chip"><input type="checkbox" name="styleIds" value="${esc(idOf(st))}" ${((Array.isArray(p.styles) && p.styles.some((x: AnyRecord) => idOf(x) === idOf(st))) || (Array.isArray(p.style_ids) && p.style_ids.includes(idOf(st)))) ? 'checked' : ''}> ${esc(str(st, 'name'))}</label>`).join('') || '<span class="muted small">No styles have been added yet.</span>'}</div></div>
        <div class="field"><label><input type="checkbox" name="published" ${bool(p, 'published', 'is_published', 'isPublished') ? 'checked' : ''}> Published</label></div>
        <button class="btn btn-gold btn-block" type="submit">${d.edit ? 'Save changes' : 'Create post'}</button>
      </form>
    </section></div>`;
  }
  if (state.modal === 'confirm-delete') return `<div class="modal-backdrop"><section class="modal" role="alertdialog" aria-modal="true"><div class="modal-head"><h2>Remove this post?</h2><button class="icon-button" data-action="close-modal" aria-label="Close">${icon('close')}</button></div><p class="muted">The post and its comments, Likes, MMCs and style links will be deleted. The original file remains in ZeroStorage.</p><div class="row"><button class="btn btn-danger" data-action="confirm-post-delete" data-id="${esc(d.id)}">Delete post</button><button class="btn" data-action="close-modal">Cancel</button></div></section></div>`;
  if (state.modal === 'confirm-model-delete') return `<div class="modal-backdrop"><section class="modal" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title"><div class="modal-head"><h2 id="dialog-title">Delete ${esc(d.name||'this model')}?</h2><button class="icon-button" data-action="close-modal" aria-label="Close">${icon('close')}</button></div><p class="muted">This permanently deletes the model, linked posts, comments, Likes, MMCs, follows and style links. The original files remain in ZeroStorage.</p><div class="row"><button class="btn btn-danger" data-action="confirm-model-delete" data-id="${esc(d.id)}">Delete model and posts</button><button class="btn" data-action="close-modal">Cancel</button></div></section></div>`;
  return '';
}

function adminOverlayMarkup(): string {
  if (state.importReview) {
    return `<div class="import-review-overlay" data-testid="import-review-overlay">${renderImportReview(state.importReview)}</div>`;
  }
  const browser = state.storageBrowser;
  if (!browser) return '';
  const sourcePath = currentStoragePath(browser);
  const source = sourceForPath(sourcePath);
  const files = browser.files.map((file) => ({
    ...file,
    compatible: browser.mode === 'profile'
      ? file.type === 'image'
      : browser.mode === 'post'
        ? file.type === 'image'
          ? source === null || source === 'ctele' || source === 'eb'
          : file.type === 'video' && (source === null || source === 'wt')
        : browser.mode === 'gallery'
          ? file.type === 'image' && (source === null || source === 'ctele' || source === 'eb')
          : file.type === 'video' && source === 'wt',
  }));
  const view: ZeroStorageBrowserState = {
    mode: browser.mode,
    breadcrumbs: browser.stack.map((folder) => ({ id: folder.id, name: folder.name })),
    folders: browser.folders,
    files,
    selectedFileIds: browser.selectedFiles.map((file) => file.id),
    selectedFolderIds: browser.selectedFolders.map((folder) => folder.id),
    loading: browser.loading,
    error: browser.error,
    page: browser.page,
    totalPages: Math.max(
      1,
      Math.ceil(browser.folderTotal / 100),
      Math.ceil(browser.fileTotal / 100),
    ),
  };
  return renderZeroStorageBrowser(view);
}

async function refreshSession(): Promise<void> {
  try {
    state.user = await getAuthUser();
    state.profile = state.user ? await getMyProfile() : null;
    if (state.user) {
      const [ids, styleIds] = await Promise.all([getFollowedModelIds(), getFollowedStyleIds()]);
      state.followed = new Set(ids);
      state.followedStyles = new Set(styleIds);
    } else {
      state.followed.clear();
      state.followedStyles.clear();
    }
  } catch (err) {
    state.user = null;
    state.profile = null;
    state.error = userError(err);
  }
}
async function render(): Promise<void> {
  const generation = ++state.generation;
  const current = state.route;
  videoObserver?.disconnect();
  root!.innerHTML = shell(stateBlock('loading'));
  try {
    if ((current.path.startsWith('/admin')) && state.user) {
      try { state.profile = await getMyProfile(); }
      catch (err) { throw err; }
    }
    if ((current.path === '/admin/models') && isAdmin()) state.styles = list(await listStyles({limit:100,offset:0}));
    const content = await page(current);
    if (generation !== state.generation) return;
    root!.innerHTML = shell(content);
    observeMedia();
    if (state.importReview || state.storageBrowser || state.modal) {
      const focusTarget = state.importReview
        ? root!.querySelector<HTMLElement>('.import-review-overlay button:not([disabled])')
        : state.storageBrowser
          ? root!.querySelector<HTMLElement>('.zsb-dialog button:not([disabled])')
          : root!.querySelector<HTMLElement>('.modal input, .modal textarea, .modal select, .modal button');
      focusTarget?.focus();
    }
  } catch (err) {
    if (generation !== state.generation) return;
    root!.innerHTML = shell(`<section class="page-head">${stateBlock('error', userError(err))}</section>`);
  }
}
let videoObserver: IntersectionObserver | null = null;
function observeMedia(): void {
  const videos = root!.querySelectorAll<HTMLVideoElement>('video[data-feed-video]');
  if (!videos.length) return;
  if (!('IntersectionObserver' in window)) {
    videos.forEach(v => { v.src = v.dataset.src || ''; });
    return;
  }
  videoObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const video = entry.target as HTMLVideoElement;
      if (entry.isIntersecting) {
        if (!video.src) video.src = video.dataset.src || '';
        void video.play().catch(() => {});
      } else video.pause();
    }
  }, { threshold: 0.55 });
  videos.forEach(v => videoObserver!.observe(v));
}
function formValues(form: HTMLFormElement): FormData { return new FormData(form); }
async function openComments(postId: string): Promise<void> {
  state.modal = 'comments';
  state.modalData = { postId, loading: true, comments: [] };
  await render();
  try {
    const comments = list(await listComments(postId));
    state.modalData = { postId, loading: false, comments };
    await render();
  } catch (err) {
    state.modalData = { postId, loading: false, comments: [] };
    await render();
    toast(userError(err));
  }
}
function currentStorageFolder(browser: StorageBrowserSession): ZeroFolder {
  return browser.stack.at(-1) ?? browser.rootFolder;
}

function currentStoragePath(browser: StorageBrowserSession): string {
  return browser.stack.map((folder) => folder.name).join('/');
}

async function loadStorageBrowser(browser: StorageBrowserSession): Promise<void> {
  const requestId = ++browser.requestId;
  browser.loading = true;
  browser.error = undefined;
  await render();
  try {
    const current = currentStorageFolder(browser);
    const [folders, files] = await Promise.all([
      listFolders(current.id, browser.page),
      listFiles(current.id, browser.page),
    ]);
    if (state.storageBrowser !== browser || browser.requestId !== requestId) return;
    browser.folders = folders.items;
    browser.files = files.items;
    browser.folderTotal = folders.total;
    browser.fileTotal = files.total;
  } catch (err) {
    if (state.storageBrowser !== browser || browser.requestId !== requestId) return;
    browser.error = userError(err);
  } finally {
    if (state.storageBrowser === browser && browser.requestId === requestId) {
      browser.loading = false;
      await render();
    }
  }
}

async function openStorageBrowser(mode: ImportMode, purpose: 'profile' | 'bulk' | 'post'): Promise<void> {
  if (purpose === 'profile') captureModelFormDraft();
  if (purpose === 'post') capturePostFormDraft();
  const browser: StorageBrowserSession = {
    mode,
    purpose,
    rootFolder: { id: '', name: 'Storage root' },
    stack: [],
    folders: [],
    files: [],
    selectedFiles: [],
    selectedFolders: [],
    page: 1,
    folderTotal: 0,
    fileTotal: 0,
    loading: true,
    requestId: 0,
  };
  state.storageBrowser = browser;
  state.importReview = null;
  await loadStorageBrowser(browser);
}

function captureModelFormDraft(): void {
  const form = root!.querySelector<HTMLFormElement>('form[data-form="model"]');
  if (!form) return;
  const values = new FormData(form);
  state.modalData.draft = {
    name: String(values.get('name') ?? ''),
    username: String(values.get('username') ?? ''),
    slug: String(values.get('slug') ?? ''),
    bio: String(values.get('bio') ?? ''),
    imageUrl: String(values.get('imageUrl') ?? ''),
    profileFileId: String(values.get('profileFileId') ?? ''),
    published: values.has('published'),
    styleIds: values.getAll('styleIds').map(String),
  };
}

function capturePostFormDraft(): void {
  const form = root!.querySelector<HTMLFormElement>('form[data-form="post"]');
  if (!form) return;
  const values = new FormData(form);
  state.modalData.draft = {
    modelId: String(values.get('modelId') ?? ''),
    caption: String(values.get('caption') ?? ''),
    fileId: String(values.get('fileId') ?? ''),
    filename: String(values.get('filename') ?? ''),
    source: String(values.get('source') ?? ''),
    sourcePath: String(values.get('sourcePath') ?? ''),
    styleIds: values.getAll('styleIds').map(String),
    published: values.has('published'),
  };
}

function browserFile(browser: StorageBrowserSession, file: ZeroFile): ZeroStorageImportFile {
  const folder = currentStorageFolder(browser);
  const sourcePath = currentStoragePath(browser);
  return {
    ...file,
    parentFolderId: folder.id,
    sourcePath,
    source: sourceForPath(sourcePath),
  };
}

function modelFormName(): string {
  const input = root!.querySelector<HTMLInputElement>('form[data-form="model"] [name="name"]');
  return input?.value.trim() || modelName(state.modalData.model);
}

async function prepareStorageReview(): Promise<void> {
  const browser = state.storageBrowser;
  if (!browser) throw new Error('The ZeroStorage browser is no longer open.');
  if (browser.mode === 'profile') {
    if (browser.selectedFiles.length !== 1) throw new Error('Choose exactly one image for the profile.');
    const validation = await revalidateZeroStorageFiles(browser.selectedFiles);
    if (validation.missing.length) throw new Error('That image is no longer available in ZeroStorage. Choose another image.');
    const file = validation.available[0];
    if (file.type !== 'image') throw new Error('Only image files can be used as profile images.');
    const group: ImportReviewGroup = {
      id: 'profile-image',
      name: 'Profile image',
      caption: '',
      files: [{ id: file.id, name: file.name, type: file.type, duplicate: false }],
      styleIds: [],
    };
    state.importReview = {
      mode: 'profile',
      purpose: 'profile',
      modelId: '',
      modelName: modelFormName(),
      styles: [],
      groups: [group],
      videos: [],
      groupFiles: { [group.id]: [file] },
      videoFiles: [],
      videoTags: {},
      publishing: false,
      progressText: 'Image is ready to assign.',
    };
    await render();
    return;
  }

  if (browser.purpose === 'post') {
    if (browser.mode !== 'post' || browser.selectedFiles.length !== 1) {
      throw new Error('Choose exactly one image or video for the post.');
    }
    const validation = await revalidateZeroStorageFiles(browser.selectedFiles);
    if (validation.missing.length) throw new Error('That media file is no longer available in ZeroStorage. Choose another file.');
    const file = validation.available[0];
    const draft = state.modalData.draft ?? {};
    state.modalData.draft = {
      ...draft,
      fileId: file.id,
      filename: file.name,
      source: file.source ?? draft.source ?? '',
      sourcePath: file.sourcePath,
    };
    state.storageBrowser = null;
    toast(`Selected ${file.name}.`);
    await render();
    return;
  }

  if (browser.mode !== 'gallery' && browser.mode !== 'video') {
    throw new Error('Choose a gallery or video import before continuing.');
  }

  const modelId = state.importModelId;
  if (!modelId) throw new Error('Choose a creator before browsing media.');
  const model = await getModelDetail(modelId);
  if (!model) throw new Error('The selected creator could not be found. Choose a creator again.');
  const styles = state.styles.map((style) => ({ id: idOf(style), name: str(style, 'name') }));
  let groups: ImportReviewGroup[] = [];
  let videos: ImportReviewVideo[] = [];
  const groupFiles: Record<string, ZeroStorageImportFile[]> = {};
  const videoFiles: ZeroStorageImportFile[] = [];
  const videoTags: Record<string, string[]> = {};

  if (browser.mode === 'gallery') {
    const assigned = new Set<string>();
    const groupMeta: Array<{ id: string; name: string; caption: string; files: ZeroStorageImportFile[] }> = [];
    for (const folder of browser.selectedFolders) {
      const discovered = await collectMediaUnderFolder(folder, 'image');
      if (!discovered.length) {
        throw new Error(`No CTele or EB images were found in “${folder.name}”. Deselect it or choose a different folder.`);
      }
      const files = discovered.filter((file) => !assigned.has(file.id));
      for (const file of files) assigned.add(file.id);
      if (files.length) {
        groupMeta.push({
          id: `folder:${folder.id}`,
          name: folder.name,
          caption: folder.name,
          files,
        });
      }
    }

    const directByParent = new Map<string, ZeroStorageImportFile[]>();
    for (const selected of browser.selectedFiles) {
      const file = selected;
      if (file.type !== 'image') {
        throw new Error(`“${file.name}” is not a CTele or EB image.`);
      }
      if (assigned.has(file.id)) continue;
      const group = directByParent.get(file.parentFolderId) ?? [];
      group.push(file);
      directByParent.set(file.parentFolderId, group);
      assigned.add(file.id);
    }
    for (const [parentFolderId, files] of directByParent) {
      const sourcePath = files[0].sourcePath;
      const folderName = sourcePath.split('/').filter(Boolean).at(-1) || 'Selected images';
      groupMeta.push({
        id: `folder:${parentFolderId}`,
        name: folderName,
        caption: folderName,
        files,
      });
    }
    if (!groupMeta.length) throw new Error('No compatible images are selected.');
    const imported = await findImportedFileIds(groupMeta.flatMap((group) => group.files.map((file) => file.id)));
    groups = groupMeta.map((group) => {
      groupFiles[group.id] = group.files;
      return {
        id: group.id,
        name: group.name,
        caption: group.caption,
        files: group.files.map((file) => ({
          id: file.id,
          name: file.name,
          type: file.type,
          duplicate: imported.has(file.id),
        })),
        styleIds: [],
      };
    });
  } else {
    const files = browser.selectedFiles;
    for (const file of files) {
      if (file.type !== 'video' || file.source !== 'wt') {
        throw new Error(`“${file.name}” is not a WT video.`);
      }
    }
    const uniqueFiles = [...new Map(files.map((file) => [file.id, file])).values()];
    if (!uniqueFiles.length) throw new Error('Choose at least one WT video.');
    const imported = await findImportedFileIds(uniqueFiles.map((file) => file.id));
    const stylesBySlug = new Map(styles.map((style) => [normalizeStyleSlug(style.name), style.id]));
    videoFiles.push(...uniqueFiles);
    videos = uniqueFiles.map((file) => {
      const filenameTags = styleTagsFromFilename(file.name);
      videoTags[file.id] = filenameTags;
      const styleIds = [...new Set(filenameTags
        .map((tag) => stylesBySlug.get(normalizeStyleSlug(tag)))
        .filter((styleId): styleId is string => Boolean(styleId)))];
      return {
        id: file.id,
        name: file.name,
        caption: captionFromFilename(file.name),
        duplicate: imported.has(file.id),
        styleIds,
        filenameTags,
      };
    });
  }

  state.importReview = {
    mode: browser.mode,
    purpose: 'bulk',
    modelId,
    modelName: model.name,
    styles,
    groups,
    videos,
    groupFiles,
    videoFiles,
    videoTags,
    publishing: false,
    progressText: 'Ready to import.',
  };
  await render();
}

function fileIsSelectable(browser: StorageBrowserSession, file: ZeroFile): boolean {
  if (browser.mode === 'profile') return file.type === 'image';
  const source = sourceForPath(currentStoragePath(browser));
  if (browser.mode === 'post') {
    return file.type === 'image'
      ? source === null || source === 'ctele' || source === 'eb'
      : file.type === 'video' && (source === null || source === 'wt');
  }
  if (browser.mode === 'gallery') return file.type === 'image';
  return file.type === 'video' && source === 'wt';
}

function toggleReviewStyle(groupId: string, styleId: string): void {
  const review = state.importReview;
  if (!review) return;
  const target = review.groups.find((group) => group.id === groupId)
    ?? review.videos.find((video) => video.id === groupId);
  if (!target) return;
  target.styleIds = target.styleIds.includes(styleId)
    ? target.styleIds.filter((id) => id !== styleId)
    : [...target.styleIds, styleId];
}

async function createReviewStyle(groupId: string): Promise<void> {
  const review = state.importReview;
  if (!review || review.purpose !== 'bulk') throw new Error('Styles can only be assigned to a media import.');
  const input = document.getElementById(`style-create-${groupId}`);
  if (!(input instanceof HTMLInputElement)) throw new Error('Enter a style name first.');
  const style = await findOrCreateStyle(input.value);
  if (!state.styles.some((item) => idOf(item) === style.id)) state.styles.push(style as AnyRecord);
  review.styles = state.styles.map((item) => ({ id: idOf(item), name: str(item, 'name') }));
  const target = review.groups.find((group) => group.id === groupId)
    ?? review.videos.find((video) => video.id === groupId);
  if (target && !target.styleIds.includes(style.id)) target.styleIds.push(style.id);
  toast(`Style “${style.name}” selected.`);
  await render();
}

function updateReviewCaption(groupId: string, caption: string): void {
  const review = state.importReview;
  if (!review) return;
  const group = review.groups.find((item) => item.id === groupId);
  if (group) group.caption = caption;
  const video = review.videos.find((item) => item.id === groupId);
  if (video) video.caption = caption;
}

async function publishStorageImport(): Promise<void> {
  const review = state.importReview;
  if (!review) throw new Error('There is no import to publish.');
  if (review.purpose === 'profile') {
    const file = review.groupFiles['profile-image']?.[0];
    if (!file) throw new Error('Choose a profile image before setting it.');
    const checked = await revalidateZeroStorageFiles([file]);
    if (checked.missing.length || checked.available[0]?.type !== 'image') {
      throw new Error('That image is no longer available. Choose another profile image.');
    }
    const draft = state.modalData.draft ?? {};
    state.modalData.draft = { ...draft, profileFileId: checked.available[0].id, imageUrl: buildDownloadUrl(checked.available[0].id) };
    state.importReview = null;
    state.storageBrowser = null;
    await render();
    toast('Profile image selected. Save the model to apply it.');
    return;
  }

  review.publishing = true;
  review.progressText = 'Checking file availability and duplicates…';
  await render();
  try {
    const expectedType: MediaType = review.mode === 'video' ? 'video' : 'image';
    const selectedFiles = review.mode === 'gallery'
      ? Object.values(review.groupFiles).flat()
      : review.videoFiles;
    const uniqueSelected = [...new Map(selectedFiles.map((file) => [file.id, file])).values()];
    const checked = await revalidateZeroStorageFiles(uniqueSelected);
    if (checked.missing.length) {
      const names = checked.missing.slice(0, 3).map((file) => file.name).join(', ');
      throw new Error(`Some selected files are no longer available${names ? `: ${names}` : ''}. Return to the browser and choose them again.`);
    }
    const invalid = checked.available.find((file) => {
      if (file.type !== expectedType) return true;
      return expectedType === 'image'
        ? file.source !== 'ctele' && file.source !== 'eb'
        : file.source !== 'wt';
    });
    if (invalid) throw new Error(`“${invalid.name}” is not a compatible ${expectedType} for its source folder.`);

    const duplicateIds = await findImportedFileIds(checked.available.map((file) => file.id));
    for (const group of review.groups) {
      group.files = group.files.map((file) => ({ ...file, duplicate: duplicateIds.has(file.id) }));
    }
    review.videos = review.videos.map((video) => ({ ...video, duplicate: duplicateIds.has(video.id) }));

    const availableById = new Map(checked.available.map((file) => [file.id, file]));
    const importItems: Array<{
      file: ZeroStorageImportFile;
      caption: string;
      styleIds: string[];
      tags: string[];
    }> = [];
    for (const group of review.groups) {
      for (const selected of review.groupFiles[group.id] ?? []) {
        const file = availableById.get(selected.id);
        if (!file || duplicateIds.has(file.id)) continue;
        importItems.push({ file, caption: group.caption, styleIds: group.styleIds, tags: [] });
      }
    }
    for (const video of review.videos) {
      const file = availableById.get(video.id);
      if (!file || duplicateIds.has(video.id)) continue;
      importItems.push({
        file,
        caption: video.caption,
        styleIds: video.styleIds,
        tags: review.videoTags[video.id] ?? [],
      });
    }
    const distinctItems = [...new Map(importItems.map((item) => [item.file.id, item])).values()];
    const skipped = duplicateIds.size;
    if (!distinctItems.length) {
      throw new Error(skipped
        ? 'Every selected file is already imported. No duplicate posts were created.'
        : 'No available files remain to import.');
    }

    const tagNames = [...new Set(distinctItems.flatMap((item) => item.tags))];
    const tagStyles = await Promise.all(tagNames.map((tag) => findOrCreateStyle(tag)));
    const stylesBySlug = new Map(tagStyles.map((style) => [normalizeStyleSlug(style.name), style]));
    for (const style of tagStyles) {
      if (!state.styles.some((item) => idOf(item) === style.id)) state.styles.push(style as AnyRecord);
    }
    review.styles = state.styles.map((item) => ({ id: idOf(item), name: str(item, 'name') }));

    let created = 0;
    let skippedDuringCreate = 0;
    for (let index = 0; index < distinctItems.length; index += 1) {
      const item = distinctItems[index];
      const taggedIds = item.tags
        .map((tag) => stylesBySlug.get(normalizeStyleSlug(tag))?.id)
        .filter((styleId): styleId is string => Boolean(styleId));
      review.progressText = `Importing ${index + 1} of ${distinctItems.length}…`;
      if (index === 0 || index % 4 === 3) await render();
      try {
        await createPost({
          model_id: review.modelId,
          caption: item.caption,
          zerostorage_file_id: item.file.id,
          filename: item.file.name,
          source: item.file.source as ContentSource,
          type: expectedType,
          source_path: item.file.sourcePath,
          published: true,
          style_ids: [...new Set([...item.styleIds, ...taggedIds])],
        });
        created += 1;
      } catch (err) {
        const message = userError(err);
        if (/23505|duplicate key|already imported/i.test(message)) {
          skippedDuringCreate += 1;
          continue;
        }
        review.publishing = false;
        review.progressText = `${created} posts imported before an error: ${message}`;
        await render();
        toast('Import stopped. Existing posts were kept; review the status before retrying.');
        return;
      }
    }

    state.importReview = null;
    state.storageBrowser = null;
    go('/admin/posts');
    toast(`${created} post${created === 1 ? '' : 's'} imported${skipped + skippedDuringCreate ? ` · ${skipped + skippedDuringCreate} duplicate${skipped + skippedDuringCreate === 1 ? '' : 's'} skipped` : ''}.`);
  } catch (err) {
    review.publishing = false;
    review.progressText = userError(err);
    await render();
    throw err;
  }
}
async function handleAction(button: HTMLElement): Promise<void> {
  const action = button.dataset.action || '';
  const id = button.dataset.id || '';
  try {
    switch (action) {
      case 'retry': state.error=''; await render(); break;
      case 'close-modal': state.modal=''; state.modalData={}; await render(); break;
      case 'modal-outside': break;
      case 'auth-mode': state.modalData.authMode=button.dataset.mode; await render(); break;
      case 'like': await toggleLike(id); await render(); break;
      case 'mmc': await toggleMMC(id); await render(); break;
      case 'follow': {
        if (!state.user) { go('/me'); toast('Sign in to follow a creator.'); break; }
        await toggleFollow(id);
        const ids = await getFollowedModelIds();
        state.followed = new Set(ids);
        toast(state.followed.has(id) ? 'Added to your follows.' : 'Removed from your follows.');
        await render(); break;
      }
      case 'style-follow': {
        if (!state.user) { go('/me'); toast('Sign in to follow a style.'); break; }
        await toggleStyleFollow(id);
        state.followedStyles = new Set(await getFollowedStyleIds());
        toast(state.followedStyles.has(id) ? 'Style followed.' : 'Style unfollowed.');
        await render(); break;
      }
      case 'comments': await openComments(id); break;
      case 'signout': await signOut(); state.user=null; state.profile=null; state.followed.clear(); state.followedStyles.clear(); go('/'); toast('You have signed out.'); break;
      case 'profile-image-select':
        if (!isAdmin()) throw new Error('Administrator access is required.');
        await openStorageBrowser('profile', 'profile');
        break;
      case 'post-media-select':
        if (!isAdmin()) throw new Error('Administrator access is required.');
        await openStorageBrowser('post', 'post');
        break;
      case 'zsb-mode': {
        const mode = button.dataset.mode;
        if (mode !== 'gallery' && mode !== 'video') throw new Error('Choose a valid import type.');
        if (!state.importModelId) throw new Error('Choose a creator before importing media.');
        state.styles = list(await listStyles({ limit: 100, offset: 0 }));
        await openStorageBrowser(mode, 'bulk');
        break;
      }
      case 'zsb-folder-open': {
        const browser = state.storageBrowser;
        if (!browser) throw new Error('The ZeroStorage browser is no longer open.');
        const folder = browser.folders.find((item) => item.id === id);
        if (!folder) throw new Error('That folder is no longer available in this view.');
        browser.stack.push(folder);
        browser.page = 1;
        await loadStorageBrowser(browser);
        break;
      }
      case 'zsb-folder-toggle': {
        const browser = state.storageBrowser;
        if (!browser || browser.mode !== 'gallery') break;
        const folder = browser.folders.find((item) => item.id === id);
        if (!folder) throw new Error('That folder is no longer available in this view.');
        const selected = browser.selectedFolders.findIndex((item) => item.id === id);
        if (selected >= 0) browser.selectedFolders.splice(selected, 1);
        else browser.selectedFolders.push({
          ...folder,
          sourcePath: `${currentStoragePath(browser)}/${folder.name}`,
        });
        await render();
        break;
      }
      case 'zsb-file-toggle': {
        const browser = state.storageBrowser;
        if (!browser) throw new Error('The ZeroStorage browser is no longer open.');
        const file = browser.files.find((item) => item.id === id);
        if (!file || !fileIsSelectable(browser, file)) throw new Error('That file is not compatible with this import.');
        const selected = browser.selectedFiles.findIndex((item) => item.id === id);
        if (browser.mode === 'profile' || browser.mode === 'post') {
          browser.selectedFiles = [browserFile(browser, file)];
        } else if (selected >= 0) {
          browser.selectedFiles.splice(selected, 1);
        } else {
          browser.selectedFiles.push(browserFile(browser, file));
        }
        await render();
        break;
      }
      case 'zsb-select-all': {
        const browser = state.storageBrowser;
        if (!browser || browser.mode !== 'gallery') break;
        const compatible = browser.files.filter((file) => fileIsSelectable(browser, file));
        const currentIds = new Set(compatible.map((file) => file.id));
        const allSelected = compatible.length > 0 && compatible.every((file) =>
          browser.selectedFiles.some((selected) => selected.id === file.id),
        );
        browser.selectedFiles = allSelected
          ? browser.selectedFiles.filter((file) => !currentIds.has(file.id))
          : [
            ...browser.selectedFiles.filter((file) => !currentIds.has(file.id)),
            ...compatible.map((file) => browserFile(browser, file)),
          ];
        await render();
        break;
      }
      case 'zsb-back': {
        const browser = state.storageBrowser;
        if (browser?.stack.length) {
          browser.stack.pop();
          browser.page = 1;
          await loadStorageBrowser(browser);
        }
        break;
      }
      case 'zsb-breadcrumb': {
        const browser = state.storageBrowser;
        if (!browser) break;
        const index = Math.max(0, Number(button.dataset.index) || 0);
        browser.stack = browser.stack.slice(0, index);
        browser.page = 1;
        await loadStorageBrowser(browser);
        break;
      }
      case 'zsb-page': {
        const browser = state.storageBrowser;
        if (!browser) break;
        const pages = Math.max(1, Math.ceil(browser.folderTotal / 100), Math.ceil(browser.fileTotal / 100));
        browser.page = Math.max(1, Math.min(pages, Number(button.dataset.page) || 1));
        await loadStorageBrowser(browser);
        break;
      }
      case 'zsb-set': await prepareStorageReview(); break;
      case 'zsb-cancel':
        state.storageBrowser = null;
        state.importReview = null;
        await render();
        break;
      case 'import-back':
        state.importReview = null;
        await render();
        break;
      case 'import-cancel':
        state.importReview = null;
        state.storageBrowser = null;
        await render();
        break;
      case 'import-style-toggle':
        toggleReviewStyle(button.dataset.group || '', button.dataset.styleId || '');
        await render();
        break;
      case 'style-inline-create':
        await createReviewStyle(button.dataset.group || '');
        break;
      case 'import-publish':
        await publishStorageImport();
        break;
      case 'reset-password': {
        const email = window.prompt('Enter your account email to receive a reset link.');
        if (email) { await sendPasswordReset(email); toast('If that account exists, a reset link is on its way.'); }
        break;
      }
      case 'model-create':
        state.styles=list(await listStyles({limit:100,offset:0}));
        state.modal='model-form'; state.modalData={edit:false}; await render(); break;
      case 'model-edit': {
        const model=await getModelDetail(id);
        if (!model) throw new Error('This model could not be found.');
        state.styles=list(await listStyles({limit:100,offset:0}));
        state.modal='model-form'; state.modalData={edit:true,model}; await render(); break;
      }
      case 'model-delete':
        state.modal='confirm-model-delete';
        state.modalData={id,name:button.dataset.name||'this model'};
        await render(); break;
      case 'post-create': {
        const [models,styles]=await Promise.all([loadModels(),listStyles({limit:100,offset:0})]);
        state.styles=list(styles);
        state.modal='post-form'; state.modalData={edit:false,models,post:{source:'',type:'image'}}; await render(); break;
      }
      case 'post-edit': {
        const [post,models,styles]=await Promise.all([getPost(id),loadModels(),listStyles({limit:100,offset:0})]);
        state.styles=list(styles);
        state.modal='post-form'; state.modalData={edit:true,post,models}; await render(); break;
      }
      case 'style-edit': {
        const name=window.prompt('Rename this style:',button.dataset.name||'');
        if (name===null) break;
        await updateStyle(id,name); toast('Style renamed.'); await render(); break;
      }
      case 'style-delete': {
        if (window.confirm(`Delete the style “${button.dataset.name||'this style'}”? Linked style labels and follows will be removed.`)) {
          await deleteStyle(id); toast('Style deleted.'); await render();
        }
        break;
      }
      case 'model-publish': {
        const model=(await loadModels()).find(x=>idOf(x)===id);
        if (!model) throw new Error('This model could not be found. Refresh the catalog and try again.');
        const published=button.dataset.published==='true';
        await updateModel(id,{published:!published});
        toast(!published?'Model published.':'Model unpublished.'); await render(); break;
      }
      case 'post-publish': {
        const published=button.dataset.published==='true';
        await updatePost(id,{published:!published});
        toast(!published?'Post published.':'Post unpublished.'); await render(); break;
      }
      case 'post-delete': state.modal='confirm-delete'; state.modalData={id}; await render(); break;
      case 'confirm-model-delete':
        await removeModel(id);
        state.modal=''; state.modalData={}; toast('Model and linked posts deleted.'); await render(); break;
      case 'confirm-post-delete':
        await deletePost(id); state.modal=''; state.modalData={}; toast('Post deleted.'); await render(); break;
      case 'comment-delete':
        if (window.confirm('Remove this comment?')) { await deleteComment(id); await openComments(state.modalData.postId); toast('Comment removed.'); }
        break;
    }
  } catch (err) { actionError(err); }
}
async function handleSubmit(form: HTMLFormElement): Promise<void> {
  const kind=form.dataset.form||'', fd=formValues(form);
  const val=(key:string)=>String(fd.get(key)||'');
  try {
    if (kind==='auth') {
      const mode=val('mode'), email=val('email'), password=val('password');
      if (mode==='signup') {
        const hasSession=await signUp(email,password,val('displayName'));
        if (!hasSession) {
          state.modalData={authMode:'signin',authNotice:'Your account was created. Check your email for the confirmation link, then sign in.'};
          await render();
          return;
        }
      } else await signIn(email,password);
      await refreshSession(); state.modalData={}; go('/'); toast(mode==='signup'?'Your account is ready.':'Welcome back.'); return;
    }
    if (kind==='comment') {
      const body=val('body').trim();
      if (!body) return;
      await createComment(val('postId'),body);
      await openComments(val('postId')); toast('Comment posted.'); return;
    }
    if (kind==='model') {
      const id=val('id');
      const profileFileId=val('profileFileId').trim();
      const input={
        name:val('name').trim(),
        username:val('username').trim() || null,
        slug:val('slug').trim(),
        description:val('bio').trim() || null,
        profile_image_url:profileFileId ? null : val('imageUrl').trim() || null,
        profile_image_zerostorage_file_id:profileFileId || null,
        published:fd.has('published'),
      };
      const saved = id ? await updateModel(id,input) : await createModel(input);
      const styles=fd.getAll('styleIds').map(String);
      if (idOf(saved)) await setModelStyles(id||idOf(saved),styles);
      state.modal=''; state.modalData={}; toast(id?'Model updated.':'Model created.'); await render(); return;
    }
    if (kind==='post') {
      const id=val('id');
      const sourceValue=val('source');
      if (!['ctele','eb','wt'].includes(sourceValue)) throw new Error('Choose a valid content source.');
      const source=sourceValue as ContentSource;
      const mediaType:MediaType=source==='wt'?'video':'image';
      const input={
        model_id:val('modelId'), caption:val('caption'),
        zerostorage_file_id:val('fileId').trim(),
        filename:val('filename').trim() || null,
        source,
        type:mediaType,
        source_path:val('sourcePath').trim() || null,
        published:fd.has('published'),
        style_ids:fd.getAll('styleIds').map(String),
      };
      if (id) await updatePost(id,input);
      else await createPost(input);
      state.modal=''; state.modalData={}; toast(id?'Post updated.':'Post created.'); await render(); return;
    }
    if (kind==='style') {
      await createStyle(val('name'));
      toast('Style added.');
      await render();
      return;
    }
  } catch (err) { actionError(err); }
}

let searchTimer = 0;
document.addEventListener('click', e => {
  const target=e.target as HTMLElement;
  const video=target.closest<HTMLVideoElement>('video[data-feed-video]');
  if (video) {
    if (video.paused) void video.play().catch(()=>{}); else video.pause();
    return;
  }
  if (target.classList.contains('modal-backdrop')) {
    state.modal=''; state.modalData={}; void render(); return;
  }
  const link=target.closest<HTMLElement>('[data-go]');
  if (link) {
    e.preventDefault();
    const dest=link.dataset.go;
    if (dest) go(dest);
    return;
  }
  const full=target.closest<HTMLElement>('[data-fullscreen]');
  if (full) {
    const src=full.dataset.fullscreen||'', kind=full.dataset.kind||'image';
    const wrap=document.createElement('div'); wrap.className='fullscreen'; wrap.setAttribute('role','dialog'); wrap.setAttribute('aria-modal','true');
    const media=kind==='video'?document.createElement('video'):document.createElement('img');
    media.className='fullscreen-media';
    media.setAttribute('src',src);
    if (media instanceof HTMLVideoElement) { media.controls=true; media.autoplay=true; media.playsInline=true; media.muted=true; }
    else media.setAttribute('alt','Expanded post media');
    const close=document.createElement('button'); close.className='fullscreen-close'; close.textContent='Close'; close.setAttribute('aria-label','Close fullscreen media');
    close.addEventListener('click',()=>{wrap.remove();full.focus();});
    wrap.addEventListener('click',ev=>{if(ev.target===wrap)wrap.remove();});
    wrap.append(media,close);
    if (media instanceof HTMLImageElement) {
      const zoom=document.createElement('button');
      zoom.className='fullscreen-zoom';
      zoom.type='button';
      zoom.textContent='Zoom in';
      zoom.setAttribute('aria-label','Zoom image in');
      let scale=1;
      const setScale=(next:number)=>{
        scale=Math.min(3,Math.max(1,next));
        media.style.transform=`scale(${scale})`;
        media.classList.toggle('zoomed',scale>1);
        zoom.textContent=scale>1?'Zoom out':'Zoom in';
        zoom.setAttribute('aria-label',scale>1?'Reset image zoom':'Zoom image in');
      };
      zoom.addEventListener('click',()=>setScale(scale>1?1:2));
      media.addEventListener('dblclick',()=>setScale(scale>1?1:2));
      wrap.addEventListener('wheel',ev=>{
        if (ev.deltaY!==0) { ev.preventDefault(); setScale(scale+(ev.deltaY<0?.2:-.2)); }
      },{passive:false});
      wrap.append(zoom);
    }
    document.body.append(wrap); close.focus(); return;
  }
  const button=target.closest<HTMLElement>('[data-action]');
  if (button) { void handleAction(button); return; }
});
document.addEventListener('submit', e => {
  const form=e.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.form) return;
  e.preventDefault(); void handleSubmit(form);
});
document.addEventListener('input', e => {
  const target=e.target;
  if (target instanceof HTMLTextAreaElement && target.dataset.action === 'import-caption') {
    updateReviewCaption(target.dataset.group || '', target.value);
    return;
  }
  if (!(target instanceof HTMLInputElement)) return;
  if (target.name === 'imageUrl') {
    const form=target.form;
    const fileId=form?.querySelector<HTMLInputElement>('input[name="profileFileId"]');
    if (fileId?.value) {
      fileId.value='';
      form?.querySelector('.profile-image-preview')?.remove();
      form?.querySelector('.profile-storage-file-id')?.remove();
    }
  }
  if (!target.matches('[data-search]')) return;
  state.search=target.value;
  window.clearTimeout(searchTimer);
  searchTimer=window.setTimeout(()=>void render(),250);
});
document.addEventListener('change', e => {
  const select=e.target;
  if (!(select instanceof HTMLSelectElement)) return;
  if (select.matches('[data-import-model]')) {
    state.importModelId=select.value;
    void render();
    return;
  }
  if (select.dataset.filter==='type') state.filterType=select.value;
  if (select.dataset.filter==='model') state.filterModel=select.value;
  if (select.dataset.filter==='type' && !['','image','video'].includes(state.filterType)) state.filterType='';
  if (select.dataset.filter) void render();
});
document.addEventListener('keydown', e => {
  if (e.key==='Escape') document.querySelector('.fullscreen')?.remove();
  const target=e.target;
  if ((e.key===' ' || e.key==='Enter') && target instanceof HTMLImageElement && target.hasAttribute('data-fullscreen')) {
    e.preventDefault();
    target.click();
  }
  if ((e.key===' ' || e.key==='Enter') && target instanceof HTMLVideoElement && target.matches('video[data-feed-video]')) {
    e.preventDefault();
    if (target.paused) void target.play().catch(()=>{}); else target.pause();
  }
  if (e.key==='Escape') {
    if (state.importReview) { state.importReview=null; void render(); }
    else if (state.storageBrowser) { state.storageBrowser=null; void render(); }
    else if (state.modal) { state.modal=''; state.modalData={}; void render(); }
  }
});
document.addEventListener('error', e => {
  const image=e.target;
  if (image instanceof HTMLImageElement && image.parentElement?.classList.contains('media-frame')) {
    const fallback=document.createElement('div');
    fallback.className='media-placeholder';
    const label=document.createElement('span');
    label.textContent='Media unavailable';
    fallback.append(label);
    image.replaceWith(fallback);
  }
}, true);
window.addEventListener('popstate',()=>{state.route=parseRoute();void render();});
try { onAuthChange(async user=>{
  state.user=user;
  try {
    state.profile=user?await getMyProfile():null;
    if (user) {
      const [ids,styleIds]=await Promise.all([getFollowedModelIds(),getFollowedStyleIds()]);
      state.followed=new Set(ids);
      state.followedStyles=new Set(styleIds);
    } else {
      state.followed.clear();
      state.followedStyles.clear();
    }
  } catch (err) { state.profile=null; state.error=userError(err); }
  void render();
}); } catch (err) { state.error=userError(err); }
void refreshSession().then(()=>render());