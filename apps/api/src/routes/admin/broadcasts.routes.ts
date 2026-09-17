import { Router } from 'express';
import { validate } from '../../middleware/validation.js';
import { idParams } from '../../lib/validation/common.schema.js';
import { adminBroadcastsQuery, createBroadcastBody } from '../../lib/validation/admin/broadcasts.schema.js';
import * as broadcasts from '../../controllers/admin/broadcasts.controller.js';

const router = Router();

router.post('/', validate(createBroadcastBody), broadcasts.create);
router.get('/', validate(adminBroadcastsQuery, 'query'), broadcasts.list);
router.get('/:id', validate(idParams, 'params'), broadcasts.getOne);

export default router;
