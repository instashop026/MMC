export interface AdminNavItem {
  href: string;
  label: string;
  count?: number;
}

export interface AdminModelRow {
  id: string;
  name: string;
  username?: string | null;
  published: boolean;
  postCount?: number;
  styles?: string[];
}

export interface AdminPostRow {
  id: string;
  filename: string;
  modelName: string;
  type: "image" | "video" | "unknown";
  source: string;
  published: boolean;
  duplicate?: boolean;
}

export interface AdminIndexState {
  modelCount?: number;
  postCount?: number;
  unpublishedModels?: number;
  unpublishedPosts?: number;
}

export interface AdminModelsState {
  models: AdminModelRow[];
  loading?: boolean;
  error?: string;
}

export interface AdminPostsState {
  posts: AdminPostRow[];
  loading?: boolean;
  error?: string;
}

export interface ZeroStorageBrowserState {
  mode: "profile" | "gallery" | "video";
  breadcrumbs: Array<{ id: string; name: string }>;
  folders: Array<{ id: string; name: string; fileCount?: number }>;
  files: Array<{ id: string; name: string; size?: number; type: "image" | "video" | "unknown"; compatible?: boolean }>;
  selectedFileIds: string[];
  selectedFolderIds: string[];
  loading: boolean;
  error?: string;
  page: number;
  totalPages: number;
}

export interface AdminImportState {
  models: Array<{ id: string; name: string }>;
  selectedModelId: string;
}

export interface ImportReviewGroup {
  id: string;
  name: string;
  caption: string;
  files: Array<{ id: string; name: string; type: "image" | "video" | "unknown"; duplicate: boolean }>;
  styleIds: string[];
}

export interface ImportReviewVideo {
  id: string;
  name: string;
  caption: string;
  duplicate: boolean;
  styleIds: string[];
  filenameTags?: string[];
}

export interface ImportReviewState {
  mode: "profile" | "gallery" | "video";
  modelName: string;
  styles: Array<{ id: string; name: string }>;
  groups: ImportReviewGroup[];
  videos: ImportReviewVideo[];
  publishing: boolean;
  progressText: string;
}

const esc = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);

const fmtCount = (value: number | undefined): string =>
  new Intl.NumberFormat("en-US").format(value ?? 0);

function adminFrame(title: string, description: string, active: string, content: string): string {
  const links = [
    ["/admin", "Overview"],
    ["/admin/models", "Creators"],
    ["/admin/posts", "Posts"],
    ["/admin/import", "Import"],
  ];
  return `<main class="admin-page" data-testid="admin-view">
    <header class="admin-heading">
      <div><span class="eyebrow">Model Feed · Control room</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>
      <span class="admin-secure"><span aria-hidden="true"></span> Admin access</span>
    </header>
    <nav class="admin-nav" aria-label="Admin sections">${links.map(([href, label]) =>
      `<a href="${href}" data-go="${href}" class="admin-nav-link${active === href ? " is-active" : ""}" ${active === href ? 'aria-current="page"' : ""}>${esc(label)}${active === href ? '<span class="admin-nav-rule" aria-hidden="true"></span>' : ""}</a>`,
    ).join("")}</nav>
    ${content}
  </main>`;
}

export function renderAdminIndex(state: AdminIndexState = {}): string {
  const content = `<section class="admin-overview-grid" aria-label="Catalog overview">
      <a class="admin-overview-primary" href="/admin/models" data-testid="admin-open-models">
        <span class="admin-kicker">Creator catalog</span><strong>${fmtCount(state.modelCount)}<small> profiles</small></strong>
        <span class="admin-overview-note">${fmtCount(state.unpublishedModels)} awaiting publication</span><span class="admin-arrow" aria-hidden="true">↗</span>
      </a>
      <a class="admin-overview-secondary" href="/admin/posts" data-testid="admin-open-posts">
        <span class="admin-kicker">Media library</span><strong>${fmtCount(state.postCount)}<small> posts</small></strong>
        <span class="admin-overview-note">${fmtCount(state.unpublishedPosts)} not published</span>
      </a>
      <section class="admin-import-callout">
        <div><span class="admin-kicker">ZeroStorage</span><h2>Bring new media into the catalog.</h2><p>Browse the locked 0RMCOIN root, select files, then review captions and styles before importing.</p></div>
        <a class="btn btn-gold" href="/admin/import">Open import desk <span aria-hidden="true">→</span></a>
      </section>
    </section>`;
  return adminFrame("Admin", "A clear view of the creator catalog and its media.", "/admin", content);
}

export function renderAdminModels(state: AdminModelsState): string {
  const body = state.loading
    ? `<div class="admin-skeleton-list" aria-label="Loading creators" aria-busy="true"><span></span><span></span><span></span></div>`
    : state.error
      ? `<div class="admin-state admin-state-error" role="alert"><strong>Creator list unavailable</strong><p>${esc(state.error)}</p><button class="btn btn-outline" data-action="retry">Try again</button></div>`
      : state.models.length
        ? `<div class="admin-data-table" role="table" aria-label="Creator profiles">
          <div class="admin-table-head admin-model-columns" role="row"><span role="columnheader">Creator</span><span role="columnheader">Styles</span><span role="columnheader">Posts</span><span role="columnheader">Status</span><span role="columnheader"><span class="sr-only">Actions</span></span></div>
          ${state.models.map((model) => `<div class="admin-table-row admin-model-columns" role="row" data-testid="admin-model-row">
            <div class="admin-record-title" role="cell"><strong>${esc(model.name)}</strong><small>${model.username ? `@${esc(model.username.replace(/^@/, ""))}` : "No username"}</small></div>
            <div class="admin-style-summary" role="cell">${model.styles?.length ? model.styles.map((style) => `<span>${esc(style)}</span>`).join("") : '<span class="muted">No styles</span>'}</div>
            <span class="admin-number" role="cell">${fmtCount(model.postCount)}</span>
            <span role="cell" class="admin-status ${model.published ? "is-live" : "is-draft"}">${model.published ? "Published" : "Unpublished"}</span>
            <div class="admin-row-actions" role="cell"><button class="plain-button" data-action="model-edit" data-id="${esc(model.id)}" aria-label="Edit ${esc(model.name)}">Edit</button><button class="plain-button" data-action="model-publish" data-id="${esc(model.id)}" data-published="${model.published}" aria-label="${model.published ? "Unpublish" : "Publish"} ${esc(model.name)}">${model.published ? "Unpublish" : "Publish"}</button></div>
          </div>`).join("")}
        </div>`
        : `<div class="admin-state admin-state-empty"><span class="admin-state-mark" aria-hidden="true">01</span><h2>No creator profiles yet</h2><p>New profiles will appear here once they are added to the catalog.</p><button class="btn btn-gold" data-action="model-create">Create a profile</button></div>`;
  const content = `<section class="admin-section">
      <div class="admin-toolbar"><div><span class="admin-kicker">Catalog management</span><h2>Creator profiles <span class="admin-count">${fmtCount(state.models.length)}</span></h2></div><button class="btn btn-gold" data-action="model-create">New creator</button></div>
      ${body}
    </section>`;
  return adminFrame("Creators", "Manage profiles and publication status.", "/admin/models", content);
}

export function renderAdminPosts(state: AdminPostsState): string {
  const body = state.loading
    ? `<div class="admin-skeleton-list" aria-label="Loading posts" aria-busy="true"><span></span><span></span><span></span></div>`
    : state.error
      ? `<div class="admin-state admin-state-error" role="alert"><strong>Post list unavailable</strong><p>${esc(state.error)}</p><button class="btn btn-outline" data-action="retry">Try again</button></div>`
      : state.posts.length
        ? `<div class="admin-data-table" role="table" aria-label="Imported media posts">
          <div class="admin-table-head admin-post-columns" role="row"><span role="columnheader">Media</span><span role="columnheader">Creator</span><span role="columnheader">Source</span><span role="columnheader">Status</span><span role="columnheader"><span class="sr-only">Actions</span></span></div>
          ${state.posts.map((post) => `<div class="admin-table-row admin-post-columns" role="row" data-testid="admin-post-row">
            <div class="admin-record-title admin-media-title" role="cell"><span class="admin-media-type ${post.type}" aria-label="${esc(post.type)}">${post.type === "video" ? "VID" : post.type === "image" ? "IMG" : "—"}</span><span><strong>${esc(post.filename)}</strong><small>${post.duplicate ? "Duplicate detected" : "Ready in catalog"}</small></span></div>
            <span class="admin-record-cell" role="cell">${esc(post.modelName)}</span>
            <span class="admin-record-cell admin-source-cell" role="cell">${esc(post.source)}</span>
            <span role="cell" class="admin-status ${post.published ? "is-live" : "is-draft"}">${post.published ? "Published" : "Unpublished"}</span>
            <div class="admin-row-actions" role="cell"><button class="plain-button" data-action="post-edit" data-id="${esc(post.id)}" aria-label="Edit ${esc(post.filename)}">Edit</button><button class="plain-button" data-action="post-publish" data-id="${esc(post.id)}" data-published="${post.published}" aria-label="${post.published ? "Unpublish" : "Publish"} ${esc(post.filename)}">${post.published ? "Unpublish" : "Publish"}</button></div>
          </div>`).join("")}
        </div>`
        : `<div class="admin-state admin-state-empty"><span class="admin-state-mark" aria-hidden="true">02</span><h2>No imported posts</h2><p>Posts linked from ZeroStorage will be organized here.</p><a class="btn btn-gold" href="/admin/import">Start an import</a></div>`;
  const content = `<section class="admin-section">
      <div class="admin-toolbar"><div><span class="admin-kicker">Media library</span><h2>Posts <span class="admin-count">${fmtCount(state.posts.length)}</span></h2></div><a class="btn btn-gold" href="/admin/import">Import media</a></div>
      ${body}
    </section>`;
  return adminFrame("Posts", "Review imported media and keep the catalog in order.", "/admin/posts", content);
}

export function renderAdminImport(state: AdminImportState): string {
  const content = `<section class="admin-section admin-import-intro">
      <div class="admin-import-lockup"><span class="admin-kicker">Connected source</span><strong>0RMCOIN <span>ROOT LOCKED</span></strong><p>Browse files without changing their location or source.</p></div>
      <div class="admin-import-process" aria-label="Import process"><span class="is-current"><b>01</b> Choose media</span><i aria-hidden="true"></i><span><b>02</b> Review details</span><i aria-hidden="true"></i><span><b>03</b> Import</span></div>
      <section class="import-model-choice" aria-labelledby="import-model-title">
        <div><span class="admin-kicker">Catalog destination</span><h2 id="import-model-title">Choose a creator</h2><p>Every imported image or video becomes an individual post for this creator.</p></div>
        <label class="sr-only" for="import-model">Creator</label>
        <select id="import-model" class="filter-select" data-import-model aria-describedby="import-model-help">
          <option value="">Choose a creator</option>
          ${state.models.map((model) => `<option value="${esc(model.id)}" ${model.id === state.selectedModelId ? "selected" : ""}>${esc(model.name)}</option>`).join("")}
        </select>
        <small id="import-model-help">${state.models.length ? "The creator is selected explicitly; folder names are never used to guess." : "Create a creator profile before importing media."}</small>
      </section>
      ${renderImportModeChoice(Boolean(state.selectedModelId))}
    </section>`;
  return adminFrame("Import media", "Select source media, then review the details before creating posts.", "/admin/import", content);
}

export function renderImportModeChoice(enabled = true): string {
  return `<section class="import-mode-choice" aria-labelledby="import-mode-title" data-testid="import-mode-choice">
    <div class="import-mode-heading"><span class="admin-kicker">Start with a media type</span><h2 id="import-mode-title">What are you importing?</h2><p>${enabled ? "Choose a workflow. Media stays in ZeroStorage; this links it to the creator catalog." : "Choose a creator above to enable importing."}</p></div>
    <div class="import-mode-options">
      <button type="button" class="import-mode-option" data-action="zsb-mode" data-mode="gallery" aria-label="Import a gallery of images and folders" ${enabled ? "" : "disabled"}>
        <span class="import-mode-index">01 / IMAGE COLLECTION</span><strong>Gallery</strong><span>Select image files and folders together.</span><span class="import-mode-arrow" aria-hidden="true">→</span>
      </button>
      <button type="button" class="import-mode-option" data-action="zsb-mode" data-mode="video" aria-label="Import video files" ${enabled ? "" : "disabled"}>
        <span class="import-mode-index">02 / VIDEO POST</span><strong>Video</strong><span>Select compatible video files for a creator.</span><span class="import-mode-arrow" aria-hidden="true">→</span>
      </button>
    </div>
    <p class="import-mode-footnote"><span aria-hidden="true">▣</span> Profile images are selected as a single image in the creator profile workflow.</p>
  </section>`;
}

function mediaBadge(type: string): string {
  const label = type === "image" ? "IMG" : type === "video" ? "VID" : "FILE";
  return `<span class="zsb-media-badge ${esc(type)}" aria-label="${esc(type)}">${label}</span>`;
}

function humanSize(size: number | undefined): string {
  if (size === undefined || !Number.isFinite(size)) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function renderZeroStorageBrowser(state: ZeroStorageBrowserState): string {
  const isCompatible = (file: ZeroStorageBrowserState["files"][number]) =>
    file.compatible ?? (state.mode === "video" ? file.type === "video" : file.type === "image");
  const selectableFiles = state.files.filter(isCompatible);
  const modeName = state.mode === "profile" ? "Profile image" : state.mode === "gallery" ? "Gallery" : "Video";
  const selectedCount = state.selectedFileIds.length + (state.mode === "gallery" ? state.selectedFolderIds.length : 0);
  const crumbs = `<button type="button" class="zsb-crumb ${state.breadcrumbs.length ? "" : "is-current"}" data-action="zsb-breadcrumb" data-index="0" ${state.breadcrumbs.length ? "" : 'aria-current="page"'}>0RMCOIN</button>${state.breadcrumbs.map((crumb, index) =>
    `<span class="zsb-crumb-separator" aria-hidden="true">/</span><button type="button" class="zsb-crumb ${index === state.breadcrumbs.length - 1 ? "is-current" : ""}" data-action="zsb-breadcrumb" data-index="${index + 1}" ${index === state.breadcrumbs.length - 1 ? 'aria-current="page"' : ""}>${esc(crumb.name)}</button>`,
  ).join("")}`;
  let results: string;
  if (state.loading) {
    results = `<div class="zsb-loading" role="status" aria-label="Loading ZeroStorage"><span></span><span></span><span></span><span></span><span></span><span></span></div>`;
  } else if (state.error) {
    results = `<div class="zsb-state zsb-error" role="alert"><span class="zsb-state-symbol" aria-hidden="true">!</span><strong>Could not open this location</strong><p>${esc(state.error)}</p></div>`;
  } else {
    const folderMarkup = state.folders.map((folder) => {
      const selected = state.selectedFolderIds.includes(folder.id);
      return `<div class="zsb-entry zsb-folder-entry">
        ${state.mode === "gallery" ? `<button type="button" class="zsb-select-control ${selected ? "is-selected" : ""}" data-action="zsb-folder-toggle" data-id="${esc(folder.id)}" aria-label="${selected ? "Deselect" : "Select"} folder ${esc(folder.name)}" aria-pressed="${selected}">${selected ? '<span aria-hidden="true">✓</span>' : ""}</button>` : ""}
        <button type="button" class="zsb-entry-main" data-action="zsb-folder-open" data-id="${esc(folder.id)}" aria-label="Open folder ${esc(folder.name)}">
          <span class="zsb-folder-glyph" aria-hidden="true"><i></i></span><span class="zsb-entry-copy"><strong>${esc(folder.name)}</strong><small>${folder.fileCount === undefined ? "Folder" : `${fmtCount(folder.fileCount)} items`}</small></span><span class="zsb-entry-arrow" aria-hidden="true">›</span>
        </button>
      </div>`;
    }).join("");
    const filesMarkup = state.files.map((file) => {
      const compatible = isCompatible(file);
      const selected = state.selectedFileIds.includes(file.id);
      const disabled = !compatible;
      return `<div class="zsb-entry zsb-file-entry ${disabled ? "is-incompatible" : ""}">
        <button type="button" class="zsb-select-control ${selected ? "is-selected" : ""}" data-action="zsb-file-toggle" data-id="${esc(file.id)}" aria-label="${compatible ? `${selected ? "Deselect" : "Select"} ${file.type} ${esc(file.name)}` : `${esc(file.name)} is not compatible with ${modeName}`}" aria-pressed="${selected}" ${disabled ? "disabled" : ""}>${selected ? '<span aria-hidden="true">✓</span>' : ""}</button>
        ${mediaBadge(file.type)}
        <span class="zsb-entry-copy"><strong>${esc(file.name)}</strong><small>${humanSize(file.size) || (disabled ? "Not compatible with this mode" : file.type === "unknown" ? "File type not recognized" : `${file.type === "image" ? "Image" : "Video"} file`)}</small></span>
        ${disabled ? '<span class="zsb-incompatible-label">Incompatible</span>' : selected ? '<span class="zsb-selected-label">Selected</span>' : ""}
      </div>`;
    }).join("");
    if (!folderMarkup && !filesMarkup) {
      results = `<div class="zsb-state zsb-empty" role="status"><span class="zsb-state-symbol" aria-hidden="true">—</span><strong>This folder is empty</strong><p>No folders or files are available at this location.</p></div>`;
    } else if (!selectableFiles.length && !state.folders.length) {
      results = `<div class="zsb-state zsb-empty" role="status"><span class="zsb-state-symbol" aria-hidden="true">!</span><strong>No compatible ${state.mode === "video" ? "video files" : "images"}</strong><p>This location has files, but none can be selected for ${modeName.toLowerCase()}.</p></div><div class="zsb-entry-list">${filesMarkup}</div>`;
    } else {
      results = `${state.mode === "gallery" && state.folders.length ? `<div class="zsb-list-section"><span>Folders</span><small>Open or include in gallery</small></div>` : ""}
        ${folderMarkup ? `<div class="zsb-entry-list">${folderMarkup}</div>` : ""}
        ${state.files.length ? `<div class="zsb-list-section"><span>Files</span><small>${fmtCount(selectableFiles.length)} compatible</small></div><div class="zsb-entry-list">${filesMarkup}</div>` : ""}
        ${state.folders.length && !state.files.length ? `<p class="zsb-folder-hint">Open a folder to view its contents.</p>` : ""}`;
    }
  }
  const page = Math.max(1, state.page);
  const totalPages = Math.max(1, state.totalPages);
  return `<div class="zsb-overlay" data-testid="zerostorage-browser">
    <section class="zsb-dialog" role="dialog" aria-modal="true" aria-labelledby="zsb-title">
      <header class="zsb-header">
        <div class="zsb-heading"><span class="admin-kicker">ZeroStorage · ${esc(modeName)} import</span><h2 id="zsb-title">Choose media</h2><p>Files are linked to the catalog; originals remain untouched.</p></div>
        <button type="button" class="zsb-close btn" data-action="zsb-cancel" aria-label="Cancel and close browser">Cancel</button>
      </header>
      <div class="zsb-location">
        <button type="button" class="zsb-back" data-action="zsb-back" ${state.breadcrumbs.length ? "" : "disabled"} aria-label="Go back one folder">← <span>Back</span></button>
        <nav class="zsb-breadcrumbs" aria-label="ZeroStorage location">${crumbs}</nav>
        <span class="zsb-root-lock" aria-label="Root folder locked"><span aria-hidden="true">▣</span> ROOT LOCKED</span>
      </div>
      <div class="zsb-browser-toolbar">
        <span class="zsb-selection-count" aria-live="polite"><strong>${selectedCount}</strong> selected</span>
        ${state.mode === "gallery" ? `<button type="button" class="zsb-select-all" data-action="zsb-select-all" aria-label="${selectableFiles.every((file) => state.selectedFileIds.includes(file.id)) ? "Deselect all compatible files" : "Select all compatible files"}" ${selectableFiles.length ? "" : "disabled"}>Select all ${selectableFiles.length ? `(${selectableFiles.length})` : ""}</button>` : ""}
        <span class="zsb-type-note">${state.mode === "video" ? "Video files only" : "Image files only"}</span>
      </div>
      <div class="zsb-content" aria-live="polite">${results}</div>
      <footer class="zsb-footer">
        <div class="zsb-page-controls">${totalPages > 1 ? `<button type="button" class="btn btn-outline btn-small" data-action="zsb-page" data-page="${page - 1}" ${page <= 1 || state.loading ? "disabled" : ""}>Previous</button><span>Page ${page} of ${totalPages}</span><button type="button" class="btn btn-outline btn-small" data-action="zsb-page" data-page="${page + 1}" ${page >= totalPages || state.loading ? "disabled" : ""}>Next</button>` : `<span>${state.loading ? "Loading source…" : "Showing current location"}</span>`}</div>
        <div class="zsb-footer-actions"><button type="button" class="btn btn-outline" data-action="zsb-cancel">Cancel</button><button type="button" class="btn btn-gold" data-action="zsb-set" ${selectedCount === 0 || state.loading ? "disabled" : ""}>Set <span>${selectedCount ? `· ${selectedCount}` : ""}</span></button></div>
      </footer>
    </section>
  </div>`;
}

export function renderStylePicker(
  styles: Array<{ id: string; name: string }>,
  selectedIds: string[],
  scope: string,
): string {
  const selected = new Set(selectedIds);
  const safeScope = esc(scope);
  return `<fieldset class="import-style-picker" data-testid="style-picker-${safeScope}">
    <legend>Style assignments <span>${selected.size} selected</span></legend>
    ${styles.length
      ? `<div class="import-style-options">${styles.map((style) => {
        const active = selected.has(style.id);
        return `<button type="button" class="import-style-chip ${active ? "is-selected" : ""}" data-action="import-style-toggle" data-group="${safeScope}" data-style-id="${esc(style.id)}" aria-pressed="${active}">${active ? '<span aria-hidden="true">✓</span>' : ""}${esc(style.name)}</button>`;
      }).join("")}</div>`
      : `<p class="import-no-styles">No styles are available yet.</p>`}
    <div class="import-inline-style"><label class="sr-only" for="style-create-${safeScope}">New style name</label><input id="style-create-${safeScope}" name="styleName" maxlength="60" placeholder="Add a style"><button type="button" class="btn btn-outline btn-small" data-action="style-inline-create" data-group="${safeScope}">Create style</button></div>
  </fieldset>`;
}

function duplicateNotice(): string {
  return `<span class="import-duplicate" role="status"><span aria-hidden="true">!</span> Already imported</span>`;
}

export function renderImportReview(state: ImportReviewState): string {
  const total = state.groups.reduce((count, group) => count + group.files.length, 0) + state.videos.length;
  const galleryMarkup = state.groups.map((group) => `<section class="import-review-group" data-testid="import-review-group">
    <header class="import-review-group-head"><div><span class="admin-kicker">Gallery group</span><h3>${esc(group.name)}</h3></div><span class="import-group-count">${group.files.length} ${group.files.length === 1 ? "image" : "images"}</span></header>
    <div class="import-preview-strip" aria-label="Selected gallery files">${group.files.map((file) => `<div class="import-preview-item">${mediaBadge(file.type)}<span title="${esc(file.name)}">${esc(file.name)}</span>${file.duplicate ? duplicateNotice() : ""}</div>`).join("")}</div>
    <div class="import-review-edit"><div class="field"><label for="caption-${esc(group.id)}">Gallery caption</label><textarea id="caption-${esc(group.id)}" name="caption" data-action="import-caption" data-group="${esc(group.id)}" maxlength="2000" placeholder="Add a caption for this gallery">${esc(group.caption)}</textarea><small>Applied to every image in this group.</small></div>${renderStylePicker(state.styles, group.styleIds, group.id)}</div>
  </section>`).join("");
  const videoMarkup = state.videos.map((video) => `<section class="import-review-video" data-testid="import-review-video">
    <div class="import-video-file">${mediaBadge("video")}<div><strong>${esc(video.name)}</strong><small>Video post</small></div>${video.duplicate ? duplicateNotice() : ""}</div>
    <div class="import-review-edit"><div class="field"><label for="caption-${esc(video.id)}">Caption</label><textarea id="caption-${esc(video.id)}" name="caption" data-action="import-caption" data-group="${esc(video.id)}" maxlength="2000" placeholder="Add a caption">${esc(video.caption)}</textarea>${video.filenameTags?.length ? `<small class="import-tag-note">Filename tags will be added as styles: ${video.filenameTags.map((tag) => `#${esc(tag)}`).join(", ")}</small>` : ""}</div>${renderStylePicker(state.styles, video.styleIds, video.id)}</div>
  </section>`).join("");
  const isProfile = state.mode === "profile";
  const reviewBody = isProfile
    ? `<section class="import-profile-review"><span class="admin-kicker">Profile image</span><h3>${esc(state.groups[0]?.files[0]?.name || "Selected image")}</h3><p>This single image will be assigned to <strong>${esc(state.modelName)}</strong>.</p>${state.groups[0]?.files[0]?.duplicate ? duplicateNotice() : ""}</section>`
    : `${galleryMarkup}${videoMarkup}`;
  const duplicateCount = state.groups.reduce((count, group) => count + group.files.filter((file) => file.duplicate).length, 0) + state.videos.filter((video) => video.duplicate).length;
  return `<section class="import-review" data-testid="import-review" aria-labelledby="import-review-title">
    <header class="import-review-heading"><div><span class="admin-kicker">Step 02 · Review before linking</span><h2 id="import-review-title">Review import</h2><p>Confirm how these files will appear in the ${isProfile ? "creator profile" : "catalog"}.</p></div><button type="button" class="btn btn-outline" data-action="import-back">Back to browser</button></header>
    <div class="import-review-summary"><span><small>Creator</small><strong>${esc(state.modelName || "No creator selected")}</strong></span><span><small>Items selected</small><strong>${fmtCount(total)}</strong></span><span><small>Mode</small><strong>${isProfile ? "Profile image" : state.mode === "gallery" ? "Gallery" : "Video"}</strong></span></div>
    ${duplicateCount ? `<div class="import-review-warning" role="status"><strong>${duplicateCount} possible duplicate${duplicateCount === 1 ? "" : "s"}</strong><span>These files are already linked to posts. Review before importing.</span></div>` : ""}
    <div class="import-review-items">${reviewBody || `<div class="admin-state admin-state-empty"><h3>No media selected</h3><p>Return to ZeroStorage and choose compatible files.</p></div>`}</div>
    <footer class="import-review-footer"><p class="import-progress" role="status" aria-live="polite">${esc(state.progressText || "Ready to import")}</p><div><button type="button" class="btn btn-outline" data-action="import-cancel" ${state.publishing ? "disabled" : ""}>Cancel</button><button type="button" class="btn btn-gold" data-action="import-publish" ${state.publishing || !total ? "disabled" : ""}>${state.publishing ? "Importing…" : isProfile ? "Set profile image" : `Import ${total} ${total === 1 ? "item" : "items"}`}</button></div></footer>
    </section>`;
}