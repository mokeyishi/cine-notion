export function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw httpError(500, `缺少环境变量 ${name}`);
  }
  return value;
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function sendJson(res, status, body) {
  res.status(status).json(body);
}

export function sendError(res, error) {
  res.status(error.status || 500).json({
    error: error.message || "服务器错误"
  });
}

export function assertMethod(req, method) {
  if (req.method !== method) {
    throw httpError(405, `只支持 ${method} 请求`);
  }
}
