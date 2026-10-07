import { pathToFileURL } from 'node:url';

const defaultEndpoints = [
  { name: 'Gateway', url: 'http://localhost:8080/healthz' },
  { name: 'Web', url: 'http://localhost:3000/' },
];

export async function checkEndpoint(name, url, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(5000) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { name, ok: false, detail };
  }

  return {
    name,
    ok: response.ok,
    detail: `HTTP ${response.status}`,
  };
}

export async function runHealthcheck(env = process.env, fetcher = fetch, write = console.log) {
  const endpoints = [
    {
      name: 'Gateway',
      url: env.GATEWAY_HEALTH_URL ?? defaultEndpoints[0].url,
    },
    {
      name: 'Web',
      url: env.WEB_HEALTH_URL ?? defaultEndpoints[1].url,
    },
  ];
  const results = await Promise.all(
    endpoints.map(({ name, url }) => checkEndpoint(name, url, fetcher)),
  );

  for (const result of results) {
    write(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}: ${result.detail}`);
  }

  return results.every((result) => result.ok);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const healthy = await runHealthcheck();
  if (!healthy) {
    process.exitCode = 1;
  }
}
