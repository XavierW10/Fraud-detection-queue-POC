export const WORKFLOW_ERROR_STATUS = {
  forbidden: 403,
  conflict: 409,
  invalid_transition: 422,
  invalid_input: 400,
  not_found: 404,
} as const;

export type WorkflowErrorCode = keyof typeof WORKFLOW_ERROR_STATUS;

/** Every refusal from the workflow services, carrying the response status. */
export class WorkflowError extends Error {
  readonly code: WorkflowErrorCode;
  readonly status: number;

  constructor(code: WorkflowErrorCode, message: string) {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
    this.status = WORKFLOW_ERROR_STATUS[code];
  }
}
