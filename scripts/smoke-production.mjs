const rawUrl = process.env.SMOKE_URL || process.argv[2] || "";

function normalizeBaseUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Missing SMOKE_URL or URL argument.");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "bacardi-ticket-hub-smoke/1.0" },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function check({ baseUrl, path, expectedStatus = 200, includes }) {
  const url = `${baseUrl}${path}`;
  const response = await fetchWithTimeout(url);
  const body = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}.`);
  }
  if (includes && !body.includes(includes)) {
    throw new Error(`${path} did not include expected text: ${includes}`);
  }
  console.log(`ok ${path} ${response.status}`);
}

const baseUrl = normalizeBaseUrl(rawUrl);

await check({ baseUrl, path: "/", includes: "Bacardi Ticket Hub" });
await check({ baseUrl, path: "/api/auth/session" });
await check({ baseUrl, path: "/api/auth/providers" });

console.log(`Smoke checks passed for ${baseUrl}`);
