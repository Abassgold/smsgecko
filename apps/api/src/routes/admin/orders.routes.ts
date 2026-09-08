import { Router } from 'express';
import { validate } from '../../middleware/validation.js';
import { idParams } from '../../lib/validation/common.schema.js';
import { adminOrdersQuery } from '../../lib/validation/admin/orders.schema.js';
import * as orders from '../../controllers/admin/orders.controller.js';

const router = Router();

router.get('/', validate(adminOrdersQuery, 'query'), orders.list);
router.get('/:id', validate(idParams, 'params'), orders.getOne);
router.post('/:id/cancel', validate(idParams, 'params'), orders.cancel);
router.post('/:id/repoll', validate(idParams, 'params'), orders.repoll);

export default router;
