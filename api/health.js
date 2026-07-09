import { sendError, sendJson } from "./_lib/http.mjs";

export default function handler(_req, res) {
  try {
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
