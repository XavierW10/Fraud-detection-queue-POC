import { z } from 'zod';
import { ACCOUNT_STATUSES } from '@/db/schema';

const weight = z.number().positive();

export const structuringRuleSchema = z.object({
  enabled: z.boolean(),
  weight,
  minTransactions: z.number().int().min(2),
  minAmount: z.number().nonnegative(),
  maxAmount: z.number().positive(),
  windowHours: z.number().positive(),
});

export const geoImpossibilityRuleSchema = z.object({
  enabled: z.boolean(),
  weight,
  maxKmPerHour: z.number().positive(),
  earthRadiusKm: z.number().positive(),
});

export const sharedDeviceLinkageRuleSchema = z.object({
  enabled: z.boolean(),
  weight,
  linkedAccountStatuses: z.array(z.enum(ACCOUNT_STATUSES)).nonempty(),
});

export const policySchema = z.object({
  policyId: z.string().min(1),
  name: z.string().min(1),
  policyVersion: z.string().min(1),
  escalationThreshold: z.number().positive(),
  rules: z.object({
    structuring: structuringRuleSchema,
    geoImpossibility: geoImpossibilityRuleSchema,
    sharedDeviceLinkage: sharedDeviceLinkageRuleSchema,
  }),
});

export type Policy = z.infer<typeof policySchema>;
export type StructuringRule = z.infer<typeof structuringRuleSchema>;
export type GeoImpossibilityRule = z.infer<typeof geoImpossibilityRuleSchema>;
export type SharedDeviceLinkageRule = z.infer<typeof sharedDeviceLinkageRuleSchema>;

/** `policyId@policyVersion`, stamped onto a case at evaluation time. */
export function policyStamp(policy: Policy): string {
  return `${policy.policyId}@${policy.policyVersion}`;
}
