// One place for all HTTP calls. Turns the API error format
// { error: { code, message, details } } into an ApiError you can show in the UI.
// Why one wrapper instead of fetch everywhere: if the URL or error handling ever
// changes, I only have to fix it here, and components stay simple.

// Just a relative path on purpose: Vite proxies /api to Express in dev,
// so there's no hardcoded localhost and no CORS headaches.
const BASE_URL = '/api';

// A real Error subclass (not a plain object) so try/catch and stack traces work
// like normal, but it still keeps code + details from the API around.
export class ApiError extends Error {
  constructor(status, { code, message, details } = {}) {
    super(message ?? `Request failed with status ${status}`);
    this.status = status;
    this.code = code;
    // Always an array, so forms can do details.find(...) without null checks first.
    this.details = details ?? [];
  }
}

export async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  // 204 means "done, nothing to send back" (e.g. a delete), so don't try to parse a body.
  if (response.status === 204) return null;

  // If the server sends back something that isn't JSON (say, a proxy error page),
  // fall back to {} so we still throw a clean ApiError instead of a confusing parse error.
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error);
  return data;
}
