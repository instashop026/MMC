export function captionFromFilename(filename: string): string {
  const name = filename.split(/[\\/]/).pop() ?? filename;
  return name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
}

export function styleTagsFromFilename(filename: string): string[] {
  const tags = filename.match(/#[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) ?? [];
  const seen = new Set<string>();
  return tags
    .map((tag) => tag.slice(1).replace(/[_-]+/g, " ").trim())
    .filter((tag) => {
      const key = tag.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}