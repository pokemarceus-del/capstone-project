export async function loginDemo() {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:8080';
  const email = process.env.DEMO_ADMIN_EMAIL;
  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Demo administrator credentials are not configured.');
  }

  const res = await fetch(`${apiBaseUrl}/api/v1/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) throw new Error('Login failed');
  return res.json();
}
