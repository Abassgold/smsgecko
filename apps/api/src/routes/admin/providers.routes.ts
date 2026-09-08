import { Router } from 'express';
import { validate } from '../../middleware/validation.js';
import { idParams } from '../../lib/validation/common.schema.js';
import {
  createProviderBody,
  reorderProvidersBody,
  updateProviderBody,
} from '../../lib/validation/admin/providers.schema.js';
import * as providers from '../../controllers/admin/providers.controller.js';

const router = Router();

router.get('/', providers.list);
router.post('/', validate(createProviderBody), providers.create);
router.post('/reorder', validate(reorderProvidersBody), providers.reorder);
router.get('/:id', validate(idParams, 'params'), providers.getOne);
router.patch('/:id', validate(idParams, 'params'), validate(updateProviderBody), providers.update);
router.delete('/:id', validate(idParams, 'params'), providers.remove);
router.post('/:id/test', validate(idParams, 'params'), providers.test);

export default router;
