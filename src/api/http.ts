import { z } from 'zod';
import { PolicyError } from '@/policy/load';
import { WorkflowError } from '@/workflow/errors';

/**
 * One error shape for the whole API. Refusals are raised as `WorkflowError`
 * wherever they are detected — validation included — so a handler never has to
 * decide a status code, and the client always reads the same body:
 * `{ error: { code, message } }`.
 */
export type ApiError = { error: { code: string; message: string } };

const failure = (code: string, message: string, status: number) =>
  Response.json({ error: { code, message } } satisfies ApiError, { status });

function toResponse(error: unknown): Response {
  if (error instanceof WorkflowError) return failure(error.code, error.message, error.status);
  if (error instanceof PolicyError) return failure('policy_error', error.message, 500);

  console.error(error);
  return failure('internal_error', 'Unexpected server error', 500);
}

/** Runs a handler body, turning any refusal into the standard error response. */
export async function respond(run: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await run());
  } catch (error) {
    return toResponse(error);
  }
}

function parse<S extends z.ZodType>(schema: S, value: unknown, label: string): z.infer<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new WorkflowError('invalid_input', `Invalid ${label}:\n${z.prettifyError(result.error)}`);
}

export function parseParams<S extends z.ZodType>(schema: S, params: unknown): z.infer<S> {
  return parse(schema, params, 'route parameters');
}

export function parseQuery<S extends z.ZodType>(schema: S, url: URL): z.infer<S> {
  return parse(schema, Object.fromEntries(url.searchParams), 'query parameters');
}

export async function parseBody<S extends z.ZodType>(
  schema: S,
  request: Request,
): Promise<z.infer<S>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new WorkflowError('invalid_input', 'Request body must be JSON');
  }
  return parse(schema, payload, 'request body');
}
