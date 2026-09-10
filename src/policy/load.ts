import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { policySchema, type Policy } from './schema';

export const POLICY_PATH = path.join(process.cwd(), 'fraud-policy.yaml');

/** Thrown for every load failure: missing file, malformed YAML, invalid config. */
export class PolicyError extends Error {
  constructor(source: string, detail: string, options?: { cause?: unknown }) {
    super(`Invalid fraud policy (${source}): ${detail}`, options);
    this.name = 'PolicyError';
  }
}

/**
 * Parses and validates a policy document. Duplicate rule keys are rejected by
 * the YAML parser, unknown or missing ones by the strict schema.
 */
export function parsePolicy(yaml: string, source = '<inline>'): Policy {
  let document: unknown;
  try {
    // `uniqueKeys` (default) turns a duplicated rule id into a parse error.
    document = parse(yaml);
  } catch (cause) {
    throw new PolicyError(source, `malformed YAML: ${(cause as Error).message}`, { cause });
  }

  const result = policySchema.safeParse(document);
  if (!result.success) {
    throw new PolicyError(source, `\n${z.prettifyError(result.error)}`);
  }

  const policy = result.data;
  const { minAmount, maxAmount } = policy.rules.structuring;
  if (minAmount > maxAmount) {
    throw new PolicyError(source, 'structuring.minAmount must not exceed structuring.maxAmount');
  }
  return policy;
}

export function loadPolicy(filePath: string = POLICY_PATH): Policy {
  let yaml: string;
  try {
    yaml = fs.readFileSync(filePath, 'utf8');
  } catch (cause) {
    throw new PolicyError(filePath, `cannot read policy file: ${(cause as Error).message}`, {
      cause,
    });
  }
  return parsePolicy(yaml, filePath);
}
