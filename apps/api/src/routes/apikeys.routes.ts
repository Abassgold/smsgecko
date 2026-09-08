import { Router } from 'express';
import { requireUser } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { idParams } from '../lib/validation/common.schema.js';
import { createApiKeyBody } from '../lib/validation/apikeys.schema.js';
import * as apikeys from '../controllers/apikeys.controller.js';

const router = Router();
router.use(requireUser);

router.get('/', apikeys.list);
router.post('/', validate(createApiKeyBody), apikeys.create);
router.delete('/:id', validate(idParams, 'params'), apikeys.revoke);

export default router;
