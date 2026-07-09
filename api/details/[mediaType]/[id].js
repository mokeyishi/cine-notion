import { assertMethod, sendError, sendJson } from "../../_lib/http.mjs";
import { imageUrl, tmdbFetch, unique } from "../../_lib/tmdb.mjs";

export default async function handler(req, res) {
  try {
    assertMethod(req, "GET");
    const mediaType = req.query.mediaType === "tv" ? "tv" : "movie";
    const id = req.query.id;

    const [zh, en] = await Promise.all([
      tmdbFetch(`/${mediaType}/${id}`, {
        language: "zh-CN",
        append_to_response: "credits,images",
        include_image_language: "zh,en,null"
      }),
      tmdbFetch(`/${mediaType}/${id}`, { language: "en-US" })
    ]);

    const directors = mediaType === "movie"
      ? (zh.credits?.crew || []).filter((person) => person.job === "Director").map((person) => person.name)
      : (zh.created_by || []).map((person) => person.name);

    const posters = unique([
      zh.poster_path,
      ...(zh.images?.posters || []).slice(0, 12).map((poster) => poster.file_path)
    ].map((poster) => imageUrl(poster)));

    const originalTitle = zh.original_title || zh.original_name || en.original_title || en.original_name || "";
    const localizedTitle = zh.title || zh.name || "";
    const englishTitle = en.title || en.name || "";
    const releaseYear = ((mediaType === "movie" ? zh.release_date : zh.first_air_date) || "").slice(0, 4);

    sendJson(res, 200, {
      movie: {
        tmdbId: Number(id),
        mediaType,
        title: `${originalTitle || localizedTitle || englishTitle} ${releaseYear}`.trim(),
        originalTitle,
        localizedTitle,
        englishTitle,
        releaseYear,
        poster: posters[0] || "",
        posters,
        directors: unique(directors),
        cast: unique((zh.credits?.cast || []).slice(0, 10).map((person) => person.name)),
        tags: unique((zh.genres || []).map((genre) => genre.name)),
        overview: zh.overview || en.overview || ""
      }
    });
  } catch (error) {
    sendError(res, error);
  }
}
