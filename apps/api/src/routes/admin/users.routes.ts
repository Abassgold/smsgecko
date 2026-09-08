import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../lib/validation/common.schema.js';
import {
  adjustBalanceBody,
  adminUsersQuery,
  updateUserBody,
} from '../../lib/validation/admin/users.schema.js';
import * as users from '../../controllers/admin/users.controller.js';

const router = Router();

router.get('/', validate(adminUsersQuery, 'query'), users.list);
router.get('/:id', validate(idParams, 'params'), users.getOne);
router.patch('/:id', validate(idParams, 'params'), validate(updateUserBody), users.update);
router.post(
  '/:id/adjust-balance',
  validate(idParams, 'params'),
  validate(adjustBalanceBody),
  users.adjust,
);

export default router;
