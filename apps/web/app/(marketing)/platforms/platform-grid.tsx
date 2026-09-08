'use client';

import { useQuery } from '@tanstack/react-query';
import type { ServiceView } from '@smsgecko/shared';
import { apiFetch } from '@/lib/api';

const FALLBACK = [
  'WhatsApp','Telegram','Instagram','TikTok','Facebook','Google','Twitter','Discord','OpenAI',
  'Apple','Microsoft','Amazon','Netflix','Spotify','Snapchat','Tinder','PayPal','Uber','LinkedIn',
  'WeChat','Shopee','LINE','Viber','Signal','Grab','Gojek','Lazada','Tokopedia','Steam','Roblox',
  'Binance','Coinbase','AliExpress','Temu','Airbnb','KakaoTalk','Bumble','Twitch','Revolut','Wise',
].map((name, i) => ({ id: String(i), name }));

export function PlatformGrid() {
  const { data } = useQuery({
    queryKey: ['catalog', 'services', 'all'],
    queryFn: () => apiFetch<ServiceView[]>('/v1/catalog/services'),
    staleTime: 5 * 60_000,
  });

  const items = data && data.length ? data : FALLBACK;

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((s) => (
        <div
          key={s.id}
          className="rounded-xl border border-border bg-surface/60 px-4 py-3 text-sm text-muted"
        >
          {s.name}
        </div>
      ))}
    </div>
  );
}
