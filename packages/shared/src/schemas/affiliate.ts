export interface AffiliateResponse {
  code: string;
  link: string | null;
  /** 0..1 */
  rate: number;
  currentTermsVersion: string;
  acceptedTermsVersion: string | null;
  termsAccepted: boolean;
  funnel: {
    signups: number;
    activated: number;
    earningsMicro: number;
  };
}

export interface AcceptTermsBody {
  version: string;
}
