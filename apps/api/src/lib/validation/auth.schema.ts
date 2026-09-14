import * as yup from 'yup';

export const registerBody = yup.object({
  email: yup.string().trim().email().max(254).required(),
  password: yup.string().min(8).max(200).required(),
  username: yup
    .string()
    .trim()
    .min(3)
    .max(15)
    .matches(/^[a-zA-Z0-9_.-]+$/, 'letters, numbers, . _ - only')
    .optional(),
  referralCode: yup.string().trim().min(4).max(32).optional(),
});

export const loginBody = yup.object({
  /** Email address or username. */
  identifier: yup.string().trim().min(1).max(254).required(),
  password: yup.string().min(1).max(200).required(),
});

export const verifyEmailBody = yup.object({
  token: yup.string().trim().min(10).max(200).required(),
});

export const forgotPasswordBody = yup.object({
  email: yup.string().trim().email().max(254).required(),
});

export const resetPasswordBody = yup.object({
  token: yup.string().trim().min(10).max(200).required(),
  password: yup.string().min(8).max(200).required(),
});

/** A live TOTP code (6 digits) or a recovery code (10 alphanumeric chars). */
export const twoFactorCode = yup
  .string()
  .trim()
  .matches(/^(\d{6}|[A-Za-z0-9]{10})$/, 'must be a 6-digit code or a 10-character recovery code')
  .required();

export const verifyTwoFactorBody = yup.object({
  pendingToken: yup.string().trim().min(10).max(2000).required(),
  code: twoFactorCode,
});

export const enableTwoFactorBody = yup.object({
  // Setup confirmation only accepts a live code — a recovery code wouldn't
  // exist yet.
  code: yup.string().trim().matches(/^\d{6}$/, 'must be a 6-digit code').required(),
});

export const disableTwoFactorBody = yup.object({
  password: yup.string().min(1).max(200).required(),
  code: twoFactorCode,
});
