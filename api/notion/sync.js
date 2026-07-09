import { assertMethod, httpError, requireEnv, sendError, sendJson } from "../_lib/http.mjs";
import { buildNotionProperties, findExistingPage, notionFetch } from "../_lib/notion.mjs";

export default async function handler(req, res) {
  try {
    assertMethod(req, "POST");
    const databaseId = requireEnv("NOTION_DATABASE_ID");
    const metadata = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
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
      : await notionFetch("/pages", {
          method: "POST",
          body: JSON.stringify({
            parent: { database_id: databaseId },
            ...body
          })
        });

    sendJson(res, 200, {
      ok: true,
      mode: existing ? "updated" : "created",
      url: result.url
    });
  } catch (error) {
    sendError(res, error);
  }
}
