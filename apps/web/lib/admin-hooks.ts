'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminOverview,
  AdminOrderRow,
  AdminUserView,
  ProviderConfigView,
  SettingsView,
} from '@smsgecko/shared';
import { apiFetch } from './api';

interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const qs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

/* ---------- overview ---------- */
export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => apiFetch<AdminOverview>('/v1/admin/overview/'),
    refetchInterval: 30_000,
  });
}

/* ---------- providers ---------- */
export function useAdminProviders() {
  return useQuery({
    queryKey: ['admin', 'providers'],
    queryFn: () => apiFetch<ProviderConfigView[]>('/v1/admin/providers/'),
  });
}
function invalidateProviders(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['admin', 'providers'] });
  qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
}
export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      apiFetch<ProviderConfigView>('/v1/admin/providers/', { method: 'POST', body }),
    onSuccess: () => invalidateProviders(qc),
  });
}
export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      apiFetch<ProviderConfigView>(`/v1/admin/providers/${id}`, { method: 'PATCH', body }),
    onSuccess: () => invalidateProviders(qc),
  });
}
export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/v1/admin/providers/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateProviders(qc),
  });
}
export function useTestProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean; detail?: string }>(`/v1/admin/providers/${id}/test`, { method: 'POST' }),
    onSuccess: () => invalidateProviders(qc),
  });
}
export function useReorderProviders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      apiFetch<ProviderConfigView[]>('/v1/admin/providers/reorder', {
        method: 'POST',
        body: { orderedIds },
      }),
    onSuccess: () => invalidateProviders(qc),
  });
}

/* ---------- users ---------- */
export function useAdminUsers(params: { q?: string; status?: string; role?: string; page: number }) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () =>
      apiFetch<Paginated<AdminUserView>>(`/v1/admin/users/?${qs({ ...params, limit: 20 })}`),
  });
}
export function useAdminUser(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: () => apiFetch<Record<string, unknown>>(`/v1/admin/users/${id}`),
    enabled: Boolean(id),
  });
}
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { role?: string; status?: string } }) =>
      apiFetch<AdminUserView>(`/v1/admin/users/${id}`, { method: 'PATCH', body }),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'user', id] });
    },
  });
}
export function useAdjustBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amountMicro, reason }: { id: string; amountMicro: number; reason: string }) =>
      apiFetch<AdminUserView>(`/v1/admin/users/${id}/adjust-balance`, {
        method: 'POST',
        body: { amountMicro, reason },
      }),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'user', id] });
    },
  });
}

/* ---------- orders ---------- */
export function useAdminOrders(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ['admin', 'orders', params],
    queryFn: () =>
      apiFetch<Paginated<AdminOrderRow>>(`/v1/admin/orders/?${qs({ ...params, limit: 25 })}`),
  });
}
export function useCancelAdminOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/admin/orders/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] }),
  });
}
export function useRepollAdminOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/admin/orders/${id}/repoll`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] }),
  });
}

/* ---------- catalog ---------- */
export function useAdminServices() {
  return useQuery({
    queryKey: ['admin', 'services'],
    queryFn: () => apiFetch<Record<string, unknown>[]>('/v1/admin/catalog/services'),
  });
}
export function useAdminCountries() {
  return useQuery({
    queryKey: ['admin', 'countries'],
    queryFn: () => apiFetch<Record<string, unknown>[]>('/v1/admin/catalog/countries'),
  });
}
export function useAdminOffers(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ['admin', 'offers', params],
    queryFn: () =>
      apiFetch<Paginated<Record<string, unknown>>>(`/v1/admin/catalog/offers?${qs({ ...params, limit: 50 })}`),
  });
}
export function useCatalogMutation<T = unknown>(method: 'POST' | 'PATCH' | 'DELETE') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      apiFetch<T>(`/v1/admin/catalog${path}`, { method, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'services'] });
      qc.invalidateQueries({ queryKey: ['admin', 'countries'] });
      qc.invalidateQueries({ queryKey: ['admin', 'offers'] });
    },
  });
}

/* ---------- finance ---------- */
export function useAdminTransactions(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ['admin', 'txns', params],
    queryFn: () =>
      apiFetch<Paginated<Record<string, unknown>>>(`/v1/admin/finance/transactions?${qs({ ...params, limit: 25 })}`),
  });
}
export function useAdminDeposits(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ['admin', 'deposits', params],
    queryFn: () =>
      apiFetch<Paginated<Record<string, unknown>>>(`/v1/admin/finance/deposits?${qs({ ...params, limit: 25 })}`),
  });
}
export function useUpdateDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'confirmed' | 'failed' }) =>
      apiFetch(`/v1/admin/finance/deposits/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'deposits'] });
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    },
  });
}

/* ---------- settings ---------- */
export function useAdminSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => apiFetch<SettingsView>('/v1/admin/settings/'),
  });
}
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<SettingsView>) =>
      apiFetch<SettingsView>('/v1/admin/settings/', { method: 'PATCH', body }),
    onSuccess: (data) => qc.setQueryData(['admin', 'settings'], data),
  });
}
