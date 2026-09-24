'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChipPicker } from '@/components/ui/chip-picker';
import { SectionHeading } from '@/components/ui/section';
import { formatUsd } from '@/lib/format';
import { serviceIcon } from '@/lib/service-icons';
import { ApiError } from '@/lib/api';
import { useCountries, useCreateOrder, useQuote, useServices } from '@/lib/hooks';

export function NewOrder() {
  const router = useRouter();
  const [serviceQuery, setServiceQuery] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [countryId, setCountryId] = useState<string | null>(null);
  const [operator, setOperator] = useState('');
  const [offerId, setOfferId] = useState<string | null>(null);

  const services = useServices();
  const countries = useCountries();
  const quote = useQuote(serviceId ?? undefined, countryId ?? undefined);
  const createOrder = useCreateOrder();

  // Client-side filter over the full (once-fetched) catalog — see the comment on
  // useServices/useCountries. Capped after filtering, not before: a provider's
  // full service list can run into the thousands (e.g. smspool ~1,400), so we
  // still search the whole thing but only mount a manageable number of chips.
  const CHIP_RENDER_CAP = 60;
  const filteredServices = useMemo(() => {
    const needle = serviceQuery.trim().toLowerCase();
    const all = services.data ?? [];
    const matches = needle
      ? all.filter((s) => s.name.toLowerCase().includes(needle) || s.slug.toLowerCase().includes(needle))
      : all;
    return matches.slice(0, CHIP_RENDER_CAP);
  }, [services.data, serviceQuery]);
  const filteredCountries = useMemo(() => {
    const needle = countryQuery.trim().toLowerCase();
    const all = countries.data ?? [];
    const matches = needle
      ? all.filter((c) => c.name.toLowerCase().includes(needle) || c.code.toLowerCase().includes(needle))
      : all;
    return matches.slice(0, CHIP_RENDER_CAP);
  }, [countries.data, countryQuery]);

  const allOffers = useMemo(() => quote.data?.offers ?? [], [quote.data]);
  const operators = useMemo(() => quote.data?.operators ?? [], [quote.data]);
  const offers = useMemo(
    () => (operator ? allOffers.filter((o) => o.operator === operator) : allOffers),
    [allOffers, operator],
  );

  // Reset the operator filter when the service/country changes.
  useEffect(() => {
    setOperator('');
  }, [serviceId, countryId]);

  // Keep a valid tier selected: prefer the current one, else the cheapest.
  useEffect(() => {
    setOfferId((cur) => {
      if (cur && offers.some((o) => o.id === cur)) return cur;
      return offers.find((o) => o.stock == null || o.stock > 0)?.id ?? offers[0]?.id ?? null;
    });
  }, [offers]);

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
            items={filteredServices.map((s) => ({
              id: s.id,
              label: s.name,
              prefix: serviceIcon(s.name),
            }))}
            value={serviceId}
            onChange={setServiceId}
            query={serviceQuery}
            onQueryChange={setServiceQuery}
            placeholder="Search services…"
            loading={services.isFetching}
            emptyLabel={services.isError ? "Couldn't load services — try refreshing" : undefined}
          />
        </div>
        <div>
          <div className="mb-2 text-xs uppercase tracking-widest text-faint">Country</div>
          <ChipPicker
            items={filteredCountries.map((c) => ({
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
            emptyLabel={countries.isError ? "Couldn't load countries — try refreshing" : undefined}
          />
        </div>
      </div>

      {serviceId && countryId && operators.length > 1 ? (
        <div className="mt-6 border-t border-border pt-5">
          <div className="mb-2 text-xs uppercase tracking-widest text-faint">Operator</div>
          <div className="flex flex-wrap gap-2">
            {operators.map((op) => {
              const active = op.id === operator;
              return (
                <button
                  key={op.id || 'any'}
                  type="button"
                  onClick={() => setOperator(op.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    active ? 'border-accent bg-accent-soft text-text' : 'border-border text-muted hover:border-faint'
                  }`}
                >
                  {op.name}
                  <span className="ml-1.5 text-xs text-faint">
                    {formatUsd(op.fromPriceMicro)}+
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {serviceId && countryId ? (
        <div className="mt-6 border-t border-border pt-5">
          <div className="mb-2 text-xs uppercase tracking-widest text-faint">Price</div>
          {quote.isLoading ? (
            <span className="text-sm text-faint">Checking availability…</span>
          ) : offers.length === 0 ? (
            <span className="text-sm text-danger">No numbers available for that combination.</span>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
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
                      active ? 'border-accent bg-accent-soft' : 'border-border hover:border-faint'
                    } ${soldOut ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className={`h-3 w-3 shrink-0 rounded-full border ${
                          active ? 'border-accent bg-accent' : 'border-faint'
                        }`}
                      />
                      <span className="font-mono text-text">{formatUsd(o.priceMicro)}</span>
                      {!operator && o.operator ? (
                        <span className="text-xs text-faint">· {o.operator}</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-faint">
                      {o.stock === null
                        ? 'in stock'
                        : soldOut
                          ? 'sold out'
                          : `${o.stock.toLocaleString()} avail`}
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
