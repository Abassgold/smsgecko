'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChipPicker } from '@/components/ui/chip-picker';
import { SectionHeading } from '@/components/ui/section';
import { formatUsd } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useCountries, useCreateOrder, useQuote, useServices } from '@/lib/hooks';

export function NewOrder() {
  const router = useRouter();
  const [serviceQuery, setServiceQuery] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [countryId, setCountryId] = useState<string | null>(null);
  const [offerId, setOfferId] = useState<string | null>(null);

  const services = useServices(serviceQuery);
  const countries = useCountries(countryQuery);
  const quote = useQuote(serviceId ?? undefined, countryId ?? undefined);
  const createOrder = useCreateOrder();

  const offers = useMemo(() => quote.data?.offers ?? [], [quote.data]);

  // Default to the cheapest in-stock tier whenever the offer list changes; drop
  // a stale selection that's no longer in the list.
  useEffect(() => {
    setOfferId((cur) => {
      if (cur && offers.some((o) => o.id === cur)) return cur;
      return quote.data?.bestOffer?.id ?? offers[0]?.id ?? null;
    });
  }, [offers, quote.data?.bestOffer?.id]);

  const selected = offers.find((o) => o.id === offerId) ?? null;
  const canBuy = Boolean(selected) && !createOrder.isPending;

  const buy = () => {
    if (!selected) return;
    createOrder.mutate(
      // Cap at the price shown, so a tier reshuffle between quote and buy can't
      // silently charge more.
      { offerId: selected.id, maxPriceMicro: selected.priceMicro },
      { onSuccess: (order) => router.push(`/orders/${order.id}`) },
    );
  };

  return (
    <Card className="p-6">
      <SectionHeading as="h3" className="text-lg">
        New Order
      </SectionHeading>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-xs uppercase tracking-widest text-faint">Service</div>
          <ChipPicker
            items={(services.data ?? []).map((s) => ({ id: s.id, label: s.name }))}
            value={serviceId}
            onChange={setServiceId}
            query={serviceQuery}
            onQueryChange={setServiceQuery}
            placeholder="Search services…"
            loading={services.isFetching}
          />
        </div>
        <div>
          <div className="mb-2 text-xs uppercase tracking-widest text-faint">Country</div>
          <ChipPicker
            items={(countries.data ?? []).map((c) => ({
              id: c.id,
              label: c.name,
              prefix: <span>{c.flagEmoji}</span>,
            }))}
            value={countryId}
            onChange={setCountryId}
            query={countryQuery}
            onQueryChange={setCountryQuery}
            placeholder="Search countries…"
            loading={countries.isFetching}
          />
        </div>
      </div>

      {serviceId && countryId ? (
        <div className="mt-6 border-t border-border pt-5">
          <div className="mb-2 text-xs uppercase tracking-widest text-faint">Price</div>
          {quote.isLoading ? (
            <span className="text-sm text-faint">Checking availability…</span>
          ) : offers.length === 0 ? (
            <span className="text-sm text-danger">No numbers available for that combination.</span>
          ) : (
            <div className="flex flex-col gap-2">
              {offers.map((o) => {
                const soldOut = o.stock !== null && o.stock <= 0;
                const active = o.id === offerId;
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={soldOut}
                    onClick={() => setOfferId(o.id)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${
                      active
                        ? 'border-accent bg-accent-soft'
                        : 'border-border hover:border-faint'
                    } ${soldOut ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={`h-3 w-3 rounded-full border ${
                          active ? 'border-accent bg-accent' : 'border-faint'
                        }`}
                      />
                      <span className="font-mono text-text">{formatUsd(o.priceMicro)}</span>
                      {o.operator ? (
                        <span className="text-xs text-faint">route {o.operator}</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-faint">
                      {o.stock === null
                        ? 'in stock'
                        : soldOut
                          ? 'sold out'
                          : `${o.stock.toLocaleString()} in stock`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 border-t border-border pt-5 text-sm text-faint">
          Pick a service and country to see the prices.
        </div>
      )}

      <div className="mt-6 flex items-center justify-end">
        <Button onClick={buy} disabled={!canBuy}>
          {createOrder.isPending
            ? 'Ordering…'
            : selected
              ? `Buy for ${formatUsd(selected.priceMicro)}`
              : 'Buy number'}
        </Button>
      </div>

      {createOrder.isError ? (
        <p className="mt-3 text-sm text-danger">
          {createOrder.error instanceof ApiError
            ? createOrder.error.message
            : 'Could not create the order'}
        </p>
      ) : null}
    </Card>
  );
}
