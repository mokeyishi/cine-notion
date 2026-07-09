import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import searchHandler from "../api/search.js";
import detailsHandler from "../api/details/[mediaType]/[id].js";
import syncHandler from "../api/notion/sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 8787);

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/search", searchHandler);
app.get("/api/details/:mediaType/:id", (req, res) => {
  req.query.mediaType = req.params.mediaType;
  req.query.id = req.params.id;
  return detailsHandler(req, res);
});
app.post("/api/notion/sync", syncHandler);

const distDir = path.join(rootDir, "dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));
  app.use((_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.listen(port, () => {
  console.log(`CineNotion API running at http://localhost:${port}`);
});
