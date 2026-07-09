import { assertMethod, httpError, sendError, sendJson } from "./_lib/http.mjs";
import { normalizeSearchResult, tmdbFetch } from "./_lib/tmdb.mjs";

export default async function handler(req, res) {
  try {
    assertMethod(req, "GET");
    const query = String(req.query.query || "").trim();
    if (!query) throw httpError(400, "请输入片名或 TMDB ID");

    if (/^\d+$/.test(query)) {
      const [movie, tv] = await Promise.allSettled([
        tmdbFetch(`/movie/${query}`, { language: "zh-CN" }),
        tmdbFetch(`/tv/${query}`, { language: "zh-CN" })
      ]);
      const results = [];
      if (movie.status === "fulfilled") results.push(normalizeSearchResult({ ...movie.value, media_type: "movie" }));
      if (tv.status === "fulfilled") results.push(normalizeSearchResult({ ...tv.value, media_type: "tv" }));
      sendJson(res, 200, { results });
      return;
    }

    const data = await tmdbFetch("/search/multi", {
      query,
      language: "zh-CN",
      include_adult: "true"
    });
    const results = (data.results || [])
      .filter((item) => item.media_type === "movie" || item.media_type === "tv")
      .map(normalizeSearchResult);

    sendJson(res, 200, { results });
  } catch (error) {
    sendError(res, error);
  }
}
