import { assertMethod, sendError, sendJson } from "../../_lib/http.mjs";
import { imageUrl, tmdbFetch, unique } from "../../_lib/tmdb.mjs";

export default async function handler(req, res) {
  try {
    assertMethod(req, "GET");
    const mediaType = req.query.mediaType === "tv" ? "tv" : "movie";
    const id = req.query.id;

    const [ja, zh, en, credits] = await Promise.all([
      tmdbFetch(`/${mediaType}/${id}`, {
        language: "ja-JP",
        append_to_response: "images",
        include_image_language: "ja,en,null"
      }),
      tmdbFetch(`/${mediaType}/${id}`, {
        language: "zh-CN",
        append_to_response: "images",
        include_image_language: "zh,ja,en,null"
      }),
      tmdbFetch(`/${mediaType}/${id}`, { language: "en-US" }),
      tmdbFetch(`/${mediaType}/${id}/credits`, { language: "ja-JP" })
    ]);

    const directors = mediaType === "movie"
      ? (credits.crew || []).filter((person) => person.job === "Director").map(personName)
      : unique([...(ja.created_by || []).map(personName), ...(credits.crew || []).filter((person) => person.job === "Director").map(personName)]);

    const posters = unique([
      ja.poster_path,
      zh.poster_path,
      ...(ja.images?.posters || []).slice(0, 8).map((poster) => poster.file_path),
      ...(zh.images?.posters || []).slice(0, 8).map((poster) => poster.file_path)
    ].map((poster) => imageUrl(poster)));

    const originalTitle = ja.original_title || ja.original_name || zh.original_title || zh.original_name || en.original_title || en.original_name || "";
    const japaneseTitle = ja.title || ja.name || originalTitle;
    const localizedTitle = zh.title || zh.name || "";
    const englishTitle = en.title || en.name || "";
    const releaseYear = ((mediaType === "movie" ? ja.release_date || zh.release_date : ja.first_air_date || zh.first_air_date) || "").slice(0, 4);

    sendJson(res, 200, {
      movie: {
        tmdbId: Number(id),
        mediaType,
        title: `${japaneseTitle || localizedTitle || englishTitle} ${releaseYear}`.trim(),
        originalTitle: japaneseTitle || originalTitle,
        localizedTitle,
        englishTitle,
        releaseYear,
        poster: posters[0] || "",
        posters,
        directors: unique(directors),
        cast: unique((credits.cast || []).slice(0, 10).map(personName)),
        tags: unique((zh.genres || []).map((genre) => genre.name)),
        overview: zh.overview || en.overview || ""
      }
    });
  } catch (error) {
    sendError(res, error);
  }
}

function personName(person) {
  return person?.original_name || person?.name || "";
}
