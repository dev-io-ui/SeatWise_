export async function api(path, opts = {}) {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const headers = { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...opts.headers };
  const res = await fetch('/api/v1' + path, {
    credentials: 'include', ...opts, headers,
    body: isForm ? opts.body : opts.body && JSON.stringify(opts.body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { data });
  return data;
}
