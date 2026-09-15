export interface RegisterBody {
  email: string;
  password: string;
  /** 3–15 chars, `[a-zA-Z0-9_.-]`. Auto-generated from the email when omitted. */
  username?: string;
  referralCode?: string;
}

export interface LoginBody {
  /** Email address or username. */
  identifier: string;
  password: string;
}

export interface VerifyEmailBody {
  token: string;
}

export interface ForgotPasswordBody {
  email: string;
}

export interface ResetPasswordBody {
  token: string;
  password: string;
}

export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  isVerified: boolean;
  balanceMicro: number;
  affiliateCode: string;
  affiliateTermsVersion: string | null;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export interface AuthResponse {
  user: PublicUser;
}

/** What POST /auth/login returns for a 2FA-enabled account instead of a session. */
export interface TwoFactorRequiredResponse {
  twoFactorRequired: true;
  /** Short-lived — identifies who passed the password check. Exchanged for a
   *  session at POST /auth/2fa/verify along with a code. */
  pendingToken: string;
}

export type LoginResponse = AuthResponse | TwoFactorRequiredResponse;

export interface VerifyTwoFactorBody {
  pendingToken: string;
  code: string;
}

export interface TwoFactorSetupResponse {
  /** Base32 secret — shown for manual entry alongside the QR code. */
  secret: string;
  /** otpauth:// URI to render as a QR code. */
  otpauthUrl: string;
}

export interface EnableTwoFactorBody {
  code: string;
}

export interface TwoFactorEnabledResponse {
  /** Shown once — only their hashes are kept server-side. */
  recoveryCodes: string[];
}

export interface DisableTwoFactorBody {
  password: string;
  code: string;
}
