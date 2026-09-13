import * as yup from 'yup';
import { paginationFields } from '../common.schema.js';

export const adminLogsQuery = yup.object({
  targetType: yup.string().trim().max(40).optional(),
  targetId: yup.string().trim().max(60).optional(),
  ...paginationFields(100, 25),
});
export interface AdminLogsQuery {
  targetType?: string;
  targetId?: string;
  page: number;
  limit: number;
}
