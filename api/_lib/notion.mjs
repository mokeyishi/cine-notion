import { httpError, requireEnv } from "./http.mjs";
import { unique } from "./tmdb.mjs";

const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export async function notionFetch(pathname, options = {}) {
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

export async function findExistingPage(databaseId, titleProp, title) {
  const data = await notionFetch(`/databases/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: 1,
      filter: {
        property: titleProp,
        title: { equals: title }
      }
    })
  });
  return data.results?.[0] || null;
}

export function buildNotionProperties(schema, titleProp, metadata) {
  const properties = {
    [titleProp]: {
      title: [{ text: { content: String(metadata.title || "").slice(0, 2000) } }]
    }
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
