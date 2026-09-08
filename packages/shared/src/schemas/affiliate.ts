import { z } from 'zod';

export const affiliateResponse = z.object({
  code: z.string(),
  link: z.string().nullable(),
  rate: z.number(), // 0..1
  currentTermsVersion: z.string(),
  acceptedTermsVersion: z.string().nullable(),
  termsAccepted: z.boolean(),
  funnel: z.object({
    signups: z.number().int(),
    activated: z.number().int(),
    earningsMicro: z.number().int(),
  }),
});
export type AffiliateResponse = z.infer<typeof affiliateResponse>;

export const acceptTermsBody = z.object({
  version: z.string().min(1).max(120),
});
export type AcceptTermsBody = z.infer<typeof acceptTermsBody>;
