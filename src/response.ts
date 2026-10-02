import type { ApiResponse } from './types';

// Unified success response
export function ok<T>(data?: T, message?: string): Response {
  const body: ApiResponse<T> = { success: true };
  if (data !== undefined) body.data = data;
  if (message) body.message = message;
  return Response.json(body);
}

// Unified error response
export function fail(code: string, message: string, status = 400): Response {
  const body: ApiResponse = {
    success: false,
    error: { code, message },
  };
  return Response.json(body, { status });
}

// Common error shortcuts
export const unauthorized = () => fail('UNAUTHORIZED', '请先登录', 401);
export const notFound = (msg = '资源不存在') => fail('NOT_FOUND', msg, 404);
export const badRequest = (msg: string) => fail('BAD_REQUEST', msg, 400);
export const serverError = (msg = '服务器内部错误') => fail('SERVER_ERROR', msg, 500);
