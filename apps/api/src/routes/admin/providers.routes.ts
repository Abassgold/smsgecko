import { Router } from 'express';
import { validate } from '../../middleware/validation.js';
import { idParams } from '../../lib/validation/common.schema.js';
import {
  createProviderBody,
  reorderProvidersBody,
  updateProviderBody,
} from '../../lib/validation/admin/providers.schema.js';
import { create, getOne, list, remove, reorder, test, update } from '../../controllers/admin/providers.controller.js';

const router = Router();

router.get('/', list);
router.post('/', validate(createProviderBody), create);
router.post('/reorder', validate(reorderProvidersBody), reorder);
router.get('/:id', validate(idParams, 'params'), getOne);
router.patch('/:id', validate(idParams, 'params'), validate(updateProviderBody), update);
router.delete('/:id', validate(idParams, 'params'), remove);
router.post('/:id/test', validate(idParams, 'params'),test);

export default router;
