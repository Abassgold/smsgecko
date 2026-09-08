import * as yup from 'yup';
import { objectId, paginationFields } from '../common.schema.js';

export const adminUsersQuery = yup.object({
  q: yup.string().trim().max(120).optional(),
  status: yup
    .mixed<'all' | 'active' | 'suspended'>()
    .oneOf(['all', 'active', 'suspended'])
    .default('all'),
  role: yup.mixed<'all' | 'user' | 'admin'>().oneOf(['all', 'user', 'admin']).default('all'),
  ...paginationFields(100, 20),
});
export interface AdminUsersQuery {
  q?: string;
  status: 'all' | 'active' | 'suspended';
  role: 'all' | 'user' | 'admin';
  page: number;
  limit: number;
}

export const updateUserBody = yup.object({
  role: yup.mixed<'user' | 'admin'>().oneOf(['user', 'admin']).optional(),
  status: yup.mixed<'active' | 'suspended'>().oneOf(['active', 'suspended']).optional(),
});

export const adjustBalanceBody = yup.object({
  amountMicro: yup
    .number()
    .integer()
    .required()
    .test('non-zero', 'amount cannot be zero', (n) => n !== 0),
  reason: yup.string().trim().min(1).max(200).required(),
});
