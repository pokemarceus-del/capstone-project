import type { AuthRole } from '@aquaflow/authentication';

export const publicCustomerRoutes = ['/healthz', '/readyz', '/openapi.json'] as const;

export const customerRouteMethods: Readonly<Record<string, readonly string[]>> = {
  '/api/v1/info': ['GET'],
  '/api/v1/customers': ['GET', 'POST'],
  '/api/v1/customers/:id': ['GET'],
  '/api/v1/accounts': ['GET', 'POST'],
  '/api/v1/accounts/:id/status': ['PATCH'],
  '/api/v1/accounts/:id/meters': ['GET'],
  '/api/v1/meters': ['GET'],
  '/api/v1/meters/install': ['POST'],
  '/api/v1/meters/replace': ['POST'],
};

const publicRouteSet: ReadonlySet<string> = new Set(publicCustomerRoutes);

export function isPublicCustomerRoute(route: string | undefined): boolean {
  return route !== undefined && publicRouteSet.has(route);
}

export function canAccessCustomerRoute(
  role: AuthRole,
  method: string,
  route: string | undefined,
): boolean {
  if (!route) {
    return false;
  }

  const supportedMethods = customerRouteMethods[route];
  const isHeadRead = method === 'HEAD' && supportedMethods?.includes('GET');
  if (!supportedMethods?.includes(method) && !isHeadRead) {
    return false;
  }

  if (role === 'admin') {
    return true;
  }

  if (role !== 'billing_officer' || !['GET', 'HEAD'].includes(method)) {
    return false;
  }

  return supportedMethods.includes('GET');
}
