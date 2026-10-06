export class CustomerNotFoundError extends Error {
  constructor(
    message: string,
    readonly code = 'CUSTOMER_NOT_FOUND',
  ) {
    super(message);
    this.name = 'CustomerNotFoundError';
  }
}

export class CustomerConflictError extends Error {
  constructor(
    message: string,
    readonly code = 'CUSTOMER_CONFLICT',
  ) {
    super(message);
    this.name = 'CustomerConflictError';
  }
}
