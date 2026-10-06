import { fetchCustomers } from './api/customers';
import { loginDemo } from './api/auth';

const metrics = [
  { label: 'Customers', value: '12,480' },
  { label: 'Meters', value: '14,300' },
  { label: 'Bills issued', value: '8,260' },
  { label: 'Collections', value: '$1.2M' },
];

const workflow = [
  'Read and validate meter readings',
  'Approve anomalies and estimated readings',
  'Run tiered billing and issue bills',
  'Collect payments and notify customers',
];

export default async function HomePage() {
  const customersResponse = await fetchCustomers().catch(() => ({ items: [] }));
  const loginResponse = await loginDemo().catch(() => ({ user: null, accessToken: null }));

  return (
    <main>
      <section className="rounded-3xl bg-gradient-to-r from-brand-600 to-brand-500 p-8 text-white shadow-xl">
        <p className="mb-3 text-sm uppercase tracking-[0.2em] text-brand-50">AquaFlow</p>
        <h1 className="text-4xl font-bold md:text-6xl">Water meter reading and billing platform</h1>
        <p className="mt-4 max-w-2xl text-lg text-brand-50">
          Secure, auditable, and operationally resilient. This capstone project is designed around
          the required business journey of reading, validation, billing, payment, and notification.
        </p>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-slate-500">{metric.label}</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{metric.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Core business flow</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {workflow.map((step, index) => (
            <div key={step} className="rounded-xl bg-slate-50 p-4 text-slate-700">
              <span className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                {index + 1}
              </span>
              <p className="text-lg font-medium">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Customer API status</h3>
          <p className="mt-3 text-slate-600">
            {customersResponse.items?.length
              ? `Loaded ${customersResponse.items.length} customer records.`
              : 'No customer records available yet.'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Auth API status</h3>
          <p className="mt-3 text-slate-600">
            {loginResponse.user
              ? `Logged in as ${loginResponse.user.email}.`
              : 'Demo login is unavailable or the auth service is not running.'}
          </p>
        </div>
      </section>
    </main>
  );
}
