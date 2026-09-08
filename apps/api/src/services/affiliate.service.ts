import { AFFILIATE_TERMS_VERSION } from '@smsgecko/shared';
import type { AffiliateResponse } from '@smsgecko/shared';
import { env } from '../config/env.js';
import { User, type UserDoc } from '../models/User.js';
import { Order } from '../models/Order.js';
import { getSettings } from '../lib/settings.js';
import { badRequest } from '../lib/errors.js';

export async function buildAffiliateView(user: UserDoc): Promise<AffiliateResponse> {
  const rate = (await getSettings()).affiliateRatePct / 100;
  const termsAccepted = user.affiliateTermsVersion === AFFILIATE_TERMS_VERSION;

  const referredIds = await User.find({ referredBy: user._id }).distinct('_id');
  let activated = 0;
  let earnedSpendMicro = 0;
  if (referredIds.length) {
    const activatedIds = await Order.distinct('userId', {
      userId: { $in: referredIds },
      status: 'completed',
    });
    activated = activatedIds.length;
    const agg = await Order.aggregate<{ total: number }>([
      { $match: { userId: { $in: referredIds }, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$priceMicro' } } },
    ]);
    earnedSpendMicro = agg[0]?.total ?? 0;
  }

  return {
    code: user.affiliateCode,
    link: termsAccepted ? `${env.WEB_ORIGIN}/?ref=${user.affiliateCode}` : null,
    rate,
    currentTermsVersion: AFFILIATE_TERMS_VERSION,
    acceptedTermsVersion: user.affiliateTermsVersion ?? null,
    termsAccepted,
    funnel: {
      signups: referredIds.length,
      activated,
      earningsMicro: Math.round(earnedSpendMicro * rate),
    },
  };
}

export async function acceptTerms(user: UserDoc, version: string): Promise<AffiliateResponse> {
  if (version !== AFFILIATE_TERMS_VERSION) {
    throw badRequest('That is not the current terms version');
  }
  user.affiliateTermsVersion = AFFILIATE_TERMS_VERSION;
  await user.save();
  return buildAffiliateView(user);
}
