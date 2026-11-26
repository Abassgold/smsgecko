import { Router } from 'express';
import * as yup from 'yup';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate, valid } from '../../middleware/validation.js';
import { getAudience } from '../../services/admin/audience.service.js';

/** Signups by country and traffic source (admin → Audience). `days` = last N days, 0 = all time. */
const audienceQuery = yup.object({ days: yup.number().integer().min(0).max(3650).default(30) });

const router = Router();

router.get(
  '/',
  validate(audienceQuery, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await getAudience(valid<{ days: number }>(req, 'query').days));
  }),
);

export default router;
