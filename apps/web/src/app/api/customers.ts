export async function fetchCustomers() {
  const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:8080';
  const res = await fetch(`${apiBaseUrl}/api/v1/customers`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch customers');
  return res.json();
}
