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
  createdAt: string;
}

export interface AuthResponse {
  user: PublicUser;
}
