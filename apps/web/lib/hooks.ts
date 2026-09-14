'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AffiliateResponse,
  ApiKeyCreated,
  ApiKeyView,
  AuthResponse,
  CountryView,
  CreateOrderBody,
  DepositView,
  DisableTwoFactorBody,
  EnableTwoFactorBody,
  ForgotPasswordBody,
  LoginBody,
  LoginResponse,
  NotificationsResponse,
  OrderStatsResponse,
  OrderView,
  QuoteResponse,
  RegisterBody,
  ResetPasswordBody,
  ServiceView,
  TransactionView,
  TwoFactorEnabledResponse,
  TwoFactorSetupResponse,
  UpdateWebhookBody,
  VerifyEmailBody,
  VerifyTwoFactorBody,
  WalletResponse,
  WebhookConfig,
  WebhookTestResult,
} from '@smsgecko/shared';
import { apiFetch } from './api';

interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}


export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<AuthResponse>('/v1/auth/me'),
    retry: false,
    staleTime: 30_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginBody) =>
      apiFetch<LoginResponse>('/v1/auth/login', { method: 'POST', body }),
    onSuccess: (data) => {
      // The 2FA-pending branch isn't a session yet — nothing to cache.
      if (!('twoFactorRequired' in data)) qc.setQueryData(['me'], data);
    },
  });
}

export function useVerifyTwoFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VerifyTwoFactorBody) =>
      apiFetch<AuthResponse>('/v1/auth/2fa/verify', { method: 'POST', body }),
    onSuccess: (data) => qc.setQueryData(['me'], data),
  });
}

/* ---------- two-factor auth (settings) ---------- */

export function useSetupTwoFactor() {
  return useMutation({
    mutationFn: () =>
      apiFetch<TwoFactorSetupResponse>('/v1/auth/2fa/setup', { method: 'POST' }),
  });
}

export function useEnableTwoFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EnableTwoFactorBody) =>
      apiFetch<TwoFactorEnabledResponse>('/v1/auth/2fa/enable', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

export function useDisableTwoFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DisableTwoFactorBody) =>
      apiFetch<{ ok: true }>('/v1/auth/2fa/disable', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterBody) =>
      apiFetch<AuthResponse>('/v1/auth/register', { method: 'POST', body }),
    onSuccess: (data) => qc.setQueryData(['me'], data),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>('/v1/auth/logout', { method: 'POST' }),
    onSuccess: () => qc.clear(),
  });
}

export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VerifyEmailBody) =>
      apiFetch<AuthResponse>('/v1/auth/verify-email', { method: 'POST', body }),
    onSuccess: (data) => qc.setQueryData(['me'], data),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>('/v1/auth/resend-verification', { method: 'POST' }),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: ForgotPasswordBody) =>
      apiFetch<{ ok: true }>('/v1/auth/forgot-password', { method: 'POST', body }),
  });
}

export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ResetPasswordBody) =>
      apiFetch<AuthResponse>('/v1/auth/reset-password', { method: 'POST', body }),
    onSuccess: (data) => qc.setQueryData(['me'], data),
  });
}

/* ---------- wallet ---------- */

export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => apiFetch<WalletResponse>('/v1/wallet'),
  });
}

export function useTransactions(type: string, page: number) {
  return useQuery({
    queryKey: ['transactions', type, page],
    queryFn: () =>
      apiFetch<Paginated<TransactionView>>(
        `/v1/transactions?type=${type}&page=${page}&limit=20`,
      ),
  });
}

/* ---------- catalog ---------- */

export function useServices(q: string) {
  return useQuery({
    queryKey: ['services', q],
    queryFn: () =>
      apiFetch<ServiceView[]>(`/v1/catalog/services${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    staleTime: 5 * 60_000,
  });
}

export function useCountries(q: string) {
  return useQuery({
    queryKey: ['countries', q],
    queryFn: () =>
      apiFetch<CountryView[]>(`/v1/catalog/countries${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    staleTime: 5 * 60_000,
  });
}

/** Every price tier for a service×country (`.offers`), plus `.bestOffer`. */
export function useQuote(serviceId?: string, countryId?: string) {
  return useQuery({
    queryKey: ['quote', serviceId, countryId],
    queryFn: () =>
      apiFetch<QuoteResponse>(
        `/v1/catalog/quote?serviceId=${encodeURIComponent(serviceId!)}&countryId=${encodeURIComponent(countryId!)}`,
      ),
    enabled: Boolean(serviceId && countryId),
    refetchInterval: 20_000,
  });
}

/* ---------- orders ---------- */

export function useOrders(status: string, page: number) {
  return useQuery({
    queryKey: ['orders', status, page],
    queryFn: () =>
      apiFetch<Paginated<OrderView>>(`/v1/orders?status=${status}&page=${page}&limit=20`),
  });
}

export function useOrder(id: string, poll: boolean) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => apiFetch<OrderView>(`/v1/orders/${id}`),
    refetchInterval: poll ? 2500 : false,
  });
}

export function useOrderStats() {
  return useQuery({
    queryKey: ['order-stats'],
    queryFn: () => apiFetch<OrderStatsResponse>('/v1/orders/stats'),
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOrderBody) =>
      apiFetch<OrderView>('/v1/orders', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['order-stats'] });
    },
  });
}

function useOrderAction(path: (id: string) => string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<OrderView>(path(id), { method: 'POST' }),
    onSuccess: (data) => {
      qc.setQueryData(['order', data.id], data);
      qc.invalidateQueries({ queryKey: ['orders'] });
      // A cancel refunds and a reactivate charges — refresh every view that
      // shows a balance or a ledger entry.
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['order-stats'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useCancelOrder() {
  return useOrderAction((id) => `/v1/orders/${id}/cancel`);
}

/** Ask the provider for another SMS on a still-waiting order (free). */
export function useResendOrder() {
  return useOrderAction((id) => `/v1/orders/${id}/resend`);
}

/** Buy another code on a completed order, same number (charged). */
export function useReactivateOrder() {
  return useOrderAction((id) => `/v1/orders/${id}/reactivate`);
}

/* ---------- deposits ---------- */

export function useCreateDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { method: string; amountMicro: number; korapayCurrency?: string }) =>
      apiFetch<DepositView>('/v1/deposits', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['deposits'] });
    },
  });
}

export function useConfirmDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<DepositView>(`/v1/deposits/${id}/mock-confirm`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['deposits'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useDeposits(page: number) {
  return useQuery({
    queryKey: ['deposits', page],
    queryFn: () => apiFetch<Paginated<DepositView>>(`/v1/deposits?page=${page}&limit=8`),
  });
}

/* ---------- affiliate ---------- */

export function useAffiliate() {
  return useQuery({
    queryKey: ['affiliate'],
    queryFn: () => apiFetch<AffiliateResponse>('/v1/affiliate/'),
  });
}

export function useAcceptAffiliateTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: string) =>
      apiFetch<AffiliateResponse>('/v1/affiliate/accept-terms', {
        method: 'POST',
        body: { version },
      }),
    onSuccess: (data) => qc.setQueryData(['affiliate'], data),
  });
}

/* ---------- notifications ---------- */

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiFetch<NotificationsResponse>('/v1/notifications/'),
    refetchInterval: 20_000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>('/v1/notifications/read', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/* ---------- api keys ---------- */

export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiFetch<ApiKeyView[]>('/v1/api-keys/'),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string) =>
      apiFetch<ApiKeyCreated>('/v1/api-keys/', { method: 'POST', body: { label } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/v1/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

/* ---------- webhook ---------- */

export function useWebhook() {
  return useQuery({
    queryKey: ['webhook'],
    queryFn: () => apiFetch<WebhookConfig>('/v1/webhook'),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateWebhookBody) =>
      apiFetch<WebhookConfig>('/v1/webhook', { method: 'PATCH', body }),
    onSuccess: (data) => qc.setQueryData(['webhook'], data),
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: () => apiFetch<WebhookTestResult>('/v1/webhook/test', { method: 'POST' }),
  });
}
