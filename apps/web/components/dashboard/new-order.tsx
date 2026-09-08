'use client';

import { useState } from 'react';
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

  const services = useServices(serviceQuery);
  const countries = useCountries(countryQuery);
  const quote = useQuote(serviceId ?? undefined, countryId ?? undefined);
  const createOrder = useCreateOrder();

  const canBuy = Boolean(serviceId && countryId && quote.data?.available);

  const buy = () => {
    if (!serviceId || !countryId) return;
    createOrder.mutate(
      { serviceId, countryId },
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

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
        <div className="text-sm">
          {!serviceId || !countryId ? (
            <span className="text-faint">Pick a service and country to see the price.</span>
          ) : quote.isLoading ? (
            <span className="text-faint">Checking availability…</span>
          ) : quote.data?.available && quote.data.bestOffer ? (
            <span className="text-muted">
              Price{' '}
              <span className="font-mono text-text">
                {formatUsd(quote.data.bestOffer.priceMicro)}
              </span>{' '}
              · <span className="text-faint">{quote.data.bestOffer.stock} in stock</span>
            </span>
          ) : (
            <span className="text-danger">No numbers available for that combination.</span>
          )}
        </div>

        <Button onClick={buy} disabled={!canBuy || createOrder.isPending}>
          {createOrder.isPending ? 'Ordering…' : 'Buy number'}
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
