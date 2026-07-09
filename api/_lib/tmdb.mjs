import { httpError, requireEnv } from "./http.mjs";

const TMDB_BASE = "https://api.themoviedb.org/3";

export async function tmdbFetch(pathname, params = {}) {
  const apiKey = requireEnv("TMDB_API_KEY");
  const url = new URL(`${TMDB_BASE}${pathname}`);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw httpError(response.status, `TMDB 请求失败 (${response.status})`);
  }
  return response.json();
}

export function imageUrl(pathname, size = "w500") {
  return pathname ? `https://image.tmdb.org/t/p/${size}${pathname}` : "";
}

export function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

export function normalizeSearchResult(item) {
  return {
    id: item.id,
    mediaType: item.media_type,
    title: item.title || item.name || "",
    originalTitle: item.original_title || item.original_name || "",
    releaseYear: (item.release_date || item.first_air_date || "").slice(0, 4),
    posterPath: imageUrl(item.poster_path),
    overview: item.overview || ""
  };
}
