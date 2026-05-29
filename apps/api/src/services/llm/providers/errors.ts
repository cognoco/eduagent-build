export type ProviderHttpError = Error & {
  status: number;
  statusCode: number;
};

export function createProviderHttpError(
  message: string,
  status: number,
  responseBody: string,
): ProviderHttpError {
  const err = new Error(message, {
    cause: { status, statusCode: status, responseBody },
  }) as ProviderHttpError;
  err.status = status;
  err.statusCode = status;
  return err;
}
