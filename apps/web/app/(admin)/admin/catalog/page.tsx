'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import { Field, TextInput, inputClass } from '@/components/ui/field';
import { LoadingRow } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { formatUsd, parseUsd } from '@/lib/format';
import { ApiError } from '@/lib/api';
import {
  useAdminCountries,
  useAdminOffers,
  useAdminServices,
  useCatalogMutation,
} from '@/lib/admin-hooks';

type Row = Record<string, unknown>;

export default function AdminCatalogPage() {
  const [tab, setTab] = useState<'services' | 'countries' | 'offers'>('services');
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold">Catalog</h1>
      <Tabs
        items={[
          { value: 'services', label: 'Services' },
          { value: 'countries', label: 'Countries' },
          { value: 'offers', label: 'Offers' },
        ]}
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
      />
      {tab === 'services' && <Services />}
      {tab === 'countries' && <Countries />}
      {tab === 'offers' && <Offers />}
    </div>
  );
}

/* ---------------- services ---------------- */
function Services() {
  const { data, isLoading } = useAdminServices();
  const create = useCatalogMutation('POST');
  const patch = useCatalogMutation('PATCH');
  const del = useCatalogMutation('DELETE');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);

  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing('new')}>Add service</Button>
      </div>
      <Card className="mt-3 overflow-x-auto">
        {isLoading ? (
          <LoadingRow />
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Popular</th>
                <th className="px-4 py-3 font-medium">Offers</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((s) => (
                <tr key={String(s.id)} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{String(s.name)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{String(s.slug)}</td>
                  <td className="px-4 py-3">{s.popular ? <Badge tone="accent">yes</Badge> : <span className="text-faint">no</span>}</td>
                  <td className="px-4 py-3 font-mono text-muted">{String(s.offerCount)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>Edit</Button>
                      <Button variant="ghost" size="sm"
                        onClick={() => del.mutate({ path: `/services/${s.id}` })}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add service' : 'Edit service'}>
        {editing ? (
          <RecordForm
            fields={[
              { key: 'name', label: 'Name' },
              { key: 'slug', label: 'Slug', disabled: editing !== 'new' },
              { key: 'iconKey', label: 'Icon key', default: 'whatsapp' },
              { key: 'popular', label: 'Popular', type: 'checkbox' },
            ]}
            value={editing === 'new' ? {} : editing}
            error={(create.error ?? patch.error) as ApiError | null}
            pending={create.isPending || patch.isPending}
            onSubmit={(body) => {
              const done = () => setEditing(null);
              if (editing === 'new') create.mutate({ path: '/services', body }, { onSuccess: done });
              else {
                const { slug: _s, ...rest } = body;
                patch.mutate({ path: `/services/${editing.id}`, body: rest }, { onSuccess: done });
              }
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}

/* ---------------- countries ---------------- */
function Countries() {
  const { data, isLoading } = useAdminCountries();
  const create = useCatalogMutation('POST');
  const patch = useCatalogMutation('PATCH');
  const del = useCatalogMutation('DELETE');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);

  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing('new')}>Add country</Button>
      </div>
      <Card className="mt-3 overflow-x-auto">
        {isLoading ? (
          <LoadingRow />
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
                <th className="px-4 py-3 font-medium">Country</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Dial</th>
                <th className="px-4 py-3 font-medium">Offers</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((c) => (
                <tr key={String(c.id)} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{String(c.flagEmoji)} {String(c.name)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{String(c.code)}</td>
                  <td className="px-4 py-3 font-mono text-muted">+{String(c.dialCode)}</td>
                  <td className="px-4 py-3 font-mono text-muted">{String(c.offerCount)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>Edit</Button>
                      <Button variant="ghost" size="sm"
                        onClick={() => del.mutate({ path: `/countries/${c.id}` })}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add country' : 'Edit country'}>
        {editing ? (
          <RecordForm
            fields={[
              { key: 'name', label: 'Name' },
              { key: 'code', label: 'ISO code (2 letters)', disabled: editing !== 'new' },
              { key: 'dialCode', label: 'Dial code (digits)' },
              { key: 'flagEmoji', label: 'Flag emoji', default: '🏳️' },
            ]}
            value={editing === 'new' ? {} : editing}
            error={(create.error ?? patch.error) as ApiError | null}
            pending={create.isPending || patch.isPending}
            onSubmit={(body) => {
              const done = () => setEditing(null);
              if (editing === 'new') create.mutate({ path: '/countries', body }, { onSuccess: done });
              else {
                const { code: _c, ...rest } = body;
                patch.mutate({ path: `/countries/${editing.id}`, body: rest }, { onSuccess: done });
              }
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}

/* ---------------- offers ---------------- */
function Offers() {
  const services = useAdminServices();
  const [serviceId, setServiceId] = useState('');
  const [page, setPage] = useState(1);
  const offers = useAdminOffers({ serviceId: serviceId || undefined, page });
  const patch = useCatalogMutation('PATCH');
  const del = useCatalogMutation('DELETE');
  const bulk = useCatalogMutation<{ matched: number; modified: number }>('POST');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [pct, setPct] = useState('');

  const rows = (offers.data?.items ?? []) as Row[];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={serviceId}
          onChange={(e) => { setServiceId(e.target.value); setPage(1); }}
          className={`${inputClass} max-w-xs`}
        >
          <option value="">All services</option>
          {(services.data ?? []).map((s) => (
            <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>
          ))}
        </select>
        <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}>Bulk update</Button>
      </div>

      <Card className="mt-3 overflow-x-auto">
        {offers.isLoading ? (
          <LoadingRow />
        ) : rows.length === 0 ? (
          <EmptyState title="No offers" />
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-faint">
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Country</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Active</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <OfferRow
                  key={String(o.id)}
                  offer={o}
                  onSave={(body) => patch.mutate({ path: `/offers/${o.id}`, body })}
                  onDelete={() => del.mutate({ path: `/offers/${o.id}` })}
                />
              ))}
            </tbody>
          </table>
        )}
        {offers.data && offers.data.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span>Page {page} of {offers.data.totalPages}</span>
            <Button variant="secondary" size="sm" disabled={page >= offers.data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        ) : null}
      </Card>

      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk price adjust">
        <p className="text-sm text-muted">
          Adjust every offer{serviceId ? ' for the selected service' : ''} by a percentage.
        </p>
        <div className="mt-4 flex items-end gap-3">
          <Field label="Adjust by (%)">
            <TextInput type="number" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="e.g. 10 or -15" />
          </Field>
          <Button
            size="sm"
            disabled={bulk.isPending || !pct}
            onClick={() =>
              bulk.mutate(
                { path: '/offers/bulk', body: { serviceId: serviceId || undefined, adjustPricePct: Number(pct) } },
                { onSuccess: () => { setBulkOpen(false); setPct(''); } },
              )
            }
          >
            Apply
          </Button>
        </div>
      </Modal>
    </>
  );
}

function OfferRow({
  offer,
  onSave,
  onDelete,
}: {
  offer: Row;
  onSave: (body: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [price, setPrice] = useState(formatUsd(Number(offer.priceMicro), { symbol: false }));
  const [stock, setStock] = useState(String(offer.stock));
  const [active, setActive] = useState(Boolean(offer.active));
  const dirty =
    parseUsd(price) !== Number(offer.priceMicro) ||
    Number(stock) !== Number(offer.stock) ||
    active !== Boolean(offer.active);

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">{String(offer.serviceName)}</td>
      <td className="px-4 py-3 text-muted">{String(offer.countryName)}</td>
      <td className="px-4 py-2">
        <input className={`${inputClass} w-24 py-1 font-mono text-xs`} value={price} onChange={(e) => setPrice(e.target.value)} />
      </td>
      <td className="px-4 py-2">
        <input className={`${inputClass} w-20 py-1 font-mono text-xs`} value={stock} onChange={(e) => setStock(e.target.value)} />
      </td>
      <td className="px-4 py-3">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={!dirty}
            onClick={() => onSave({ priceMicro: parseUsd(price), stock: Number(stock), active })}
          >
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>Delete</Button>
        </div>
      </td>
    </tr>
  );
}

/* ---------------- generic record form ---------------- */
function RecordForm({
  fields,
  value,
  onSubmit,
  pending,
  error,
}: {
  fields: { key: string; label: string; type?: 'text' | 'checkbox'; disabled?: boolean; default?: string }[];
  value: Row;
  onSubmit: (body: Record<string, unknown>) => void;
  pending?: boolean;
  error: ApiError | null;
}) {
  const [state, setState] = useState<Record<string, unknown>>(() => {
    const s: Record<string, unknown> = {};
    for (const f of fields) s[f.key] = value[f.key] ?? (f.type === 'checkbox' ? false : (f.default ?? ''));
    return s;
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(state);
      }}
    >
      {fields.map((f) =>
        f.type === 'checkbox' ? (
          <label key={f.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(state[f.key])}
              onChange={(e) => setState({ ...state, [f.key]: e.target.checked })}
            />
            {f.label}
          </label>
        ) : (
          <Field key={f.key} label={f.label}>
            <TextInput
              value={String(state[f.key] ?? '')}
              disabled={f.disabled}
              onChange={(e) => setState({ ...state, [f.key]: e.target.value })}
              required
            />
          </Field>
        ),
      )}
      {error ? <p className="text-sm text-danger">{error.message}</p> : null}
      <Button size="sm" type="submit" className="self-start" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
