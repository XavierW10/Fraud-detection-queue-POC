import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { policySchema, type Policy } from './schema';

export const POLICY_PATH = path.join(process.cwd(), 'fraud-policy.yaml');

/** Parses and validates a policy document; throws on invalid config. */
export function parsePolicy(yaml: string, source = '<inline>'): Policy {
  const result = policySchema.safeParse(parse(yaml));
  if (!result.success) {
    throw new Error(`Invalid fraud policy (${source}):\n${z.prettifyError(result.error)}`);
  }
  const policy = result.data;
  const { minAmount, maxAmount } = policy.rules.structuring;
  if (minAmount > maxAmount) {
    throw new Error(
      `Invalid fraud policy (${source}): structuring.minAmount must not exceed structuring.maxAmount`,
    );
  }
  return policy;
}

export function loadPolicy(filePath: string = POLICY_PATH): Policy {
  return parsePolicy(fs.readFileSync(filePath, 'utf8'), filePath);
}
