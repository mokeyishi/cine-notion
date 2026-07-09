import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 8787);

app.use(express.json({ limit: "1mb" }));

const TMDB_BASE = "https://api.themoviedb.org/3";
const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    const error = new Error(`缺少环境变量 ${name}`);
    error.status = 500;
    throw error;
  }
  return value;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function tmdbFetch(pathname, params = {}) {
  const apiKey = requireEnv("TMDB_API_KEY");
  const url = new URL(`${TMDB_BASE}${pathname}`);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url);
  if (!response.ok) throw httpError(response.status, `TMDB 请求失败 (${response.status})`);
  return response.json();
}

async function notionFetch(pathname, options = {}) {
  const token = requireEnv("NOTION_TOKEN");
  const response = await fetch(`${NOTION_BASE}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw httpError(response.status, `Notion 请求失败 (${response.status}): ${detail}`);
  }
  return response.json();
}

function imageUrl(pathname, size = "w500") {
  return pathname ? `https://image.tmdb.org/t/p/${size}${pathname}` : "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function normalizeSearchResult(item) {
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

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/search", async (req, res, next) => {
  try {
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
      res.json({ results });
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
    res.json({ results });
  } catch (error) {
    next(error);
  }
});

app.get("/api/details/:mediaType/:id", async (req, res, next) => {
  try {
    const mediaType = req.params.mediaType === "tv" ? "tv" : "movie";
    const id = req.params.id;
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

    res.json({
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
    next(error);
  }
});

app.post("/api/notion/sync", async (req, res, next) => {
  try {
    const databaseId = requireEnv("NOTION_DATABASE_ID");
    const metadata = req.body;
    const schema = await notionFetch(`/databases/${databaseId}`);
    const titleProp = Object.entries(schema.properties).find(([, prop]) => prop.type === "title")?.[0];
    if (!titleProp) throw httpError(400, "Notion 数据库缺少标题字段");

    const title = String(metadata.title || "").trim();
    if (!title) throw httpError(400, "标题不能为空");

    const properties = buildNotionProperties(schema.properties, titleProp, metadata);
    const existing = await findExistingPage(databaseId, titleProp, title);
    const body = {
      properties,
      ...(metadata.poster ? { cover: { type: "external", external: { url: metadata.poster } } } : {})
    };

    const result = existing
      ? await notionFetch(`/pages/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : await notionFetch("/pages", { method: "POST", body: JSON.stringify({ parent: { database_id: databaseId }, ...body }) });

    res.json({ ok: true, mode: existing ? "updated" : "created", url: result.url });
  } catch (error) {
    next(error);
  }
});

async function findExistingPage(databaseId, titleProp, title) {
  const data = await notionFetch(`/databases/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify({ page_size: 1, filter: { property: titleProp, title: { equals: title } } })
  });
  return data.results?.[0] || null;
}

function buildNotionProperties(schema, titleProp, metadata) {
  const properties = {
    [titleProp]: { title: [{ text: { content: String(metadata.title || "").slice(0, 2000) } }] }
  };

  const mappings = [
    { names: ["发行年份", "年份", "year"], value: metadata.releaseYear },
    { names: ["封面", "poster", "图片"], value: metadata.poster },
    { names: ["导演", "director"], value: metadata.directors },
    { names: ["演员", "cast"], value: metadata.cast },
    { names: ["画质", "quality"], value: metadata.quality },
    { names: ["分辨率", "resolution"], value: metadata.resolution },
    { names: ["大小", "size"], value: metadata.size },
    { names: ["字幕", "subtitle"], value: metadata.subtitles },
    { names: ["115链接", "115", "链接", "link"], value: metadata.link115 },
    { names: ["标签", "tag", "类型", "genres"], value: metadata.tags },
    { names: ["点评", "comment", "note"], value: metadata.comment },
    { names: ["TMDB", "tmdb"], value: metadata.tmdbId },
    { names: ["媒体类型", "media"], value: metadata.mediaType }
  ];

  for (const mapping of mappings) {
    const propName = findProp(schema, mapping.names);
    if (!propName || isEmpty(mapping.value)) continue;
    const notionValue = valueForProperty(schema[propName], mapping.value);
    if (notionValue) properties[propName] = notionValue;
  }
  return properties;
}

function findProp(schema, names) {
  const entries = Object.keys(schema);
  return entries.find((name) => names.includes(name)) || entries.find((name) => {
    const lower = name.toLowerCase();
    return names.some((candidate) => lower.includes(candidate.toLowerCase()));
  });
}

function isEmpty(value) {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

function valueForProperty(prop, value) {
  const values = Array.isArray(value) ? unique(value) : [String(value).trim()].filter(Boolean);
  const text = values.join(", ");
  switch (prop.type) {
    case "number":
      return { number: Number.parseFloat(String(value)) || null };
    case "select":
      return { select: values[0] ? { name: values[0].slice(0, 100).replaceAll(",", " ") } : null };
    case "multi_select":
      return { multi_select: values.map((name) => ({ name: name.slice(0, 100).replaceAll(",", " ") })) };
    case "url":
      return { url: text || null };
    case "files":
      return { files: text ? [{ name: "Poster", type: "external", external: { url: text } }] : [] };
    case "rich_text":
      return { rich_text: text ? [{ text: { content: text.slice(0, 2000) } }] : [] };
    case "date":
      return { date: text ? { start: /^\d{4}$/.test(text) ? `${text}-01-01` : text } : null };
    case "checkbox":
      return { checkbox: Boolean(value) };
    default:
      return null;
  }
}

const distDir = path.join(rootDir, "dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));
  app.use((_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.use((error, _req, res, _next) => {
  res.status(error.status || 500).json({ error: error.message || "服务器错误" });
});

app.listen(port, () => {
  console.log(`CineNotion API running at http://localhost:${port}`);
});
