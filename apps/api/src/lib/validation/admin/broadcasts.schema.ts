import * as yup from 'yup';
import { BROADCAST_AUDIENCES } from '../../../models/Broadcast.js';
import { paginationFields } from '../common.schema.js';

export const createBroadcastBody = yup.object({
  subject: yup.string().trim().min(1).max(200).required(),
  body: yup.string().trim().min(1).max(20_000).required(),
  audience: yup.mixed<(typeof BROADCAST_AUDIENCES)[number]>().oneOf([...BROADCAST_AUDIENCES]).default('verified'),
});
export interface CreateBroadcastBody {
  subject: string;
  body: string;
  audience: (typeof BROADCAST_AUDIENCES)[number];
}

export const adminBroadcastsQuery = yup.object({
  ...paginationFields(50, 20),
});
export interface AdminBroadcastsQuery {
  page: number;
  limit: number;
}
