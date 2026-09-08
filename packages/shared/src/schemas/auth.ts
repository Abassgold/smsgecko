import { z } from 'zod';

export const registerBody = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(200),
  username: z
    .string()
    .min(3)
    .max(15)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'letters, numbers, . _ - only')
    .optional(),
  referralCode: z.string().trim().min(4).max(32).optional(),
});
export type RegisterBody = z.infer<typeof registerBody>;

export const loginBody = z.object({
  /** Email address or username. */
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});
export type LoginBody = z.infer<typeof loginBody>;

export const verifyEmailBody = z.object({
  token: z.string().min(10).max(200),
});
export type VerifyEmailBody = z.infer<typeof verifyEmailBody>;

export const publicUser = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
  role: z.enum(['user', 'admin']),
  status: z.enum(['active', 'suspended']),
  isVerified: z.boolean(),
  balanceMicro: z.number().int(),
  affiliateCode: z.string(),
  affiliateTermsVersion: z.string().nullable(),
  createdAt: z.string(),
});
export type PublicUser = z.infer<typeof publicUser>;

export const authResponse = z.object({ user: publicUser });
export type AuthResponse = z.infer<typeof authResponse>;
