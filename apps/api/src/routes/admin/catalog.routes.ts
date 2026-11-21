import { Router } from 'express';
import { validate } from '../../middleware/validation.js';
import { offerDisabledBody } from '../../lib/validation/admin/catalog.schema.js';
import { disableOffer, status, sync } from '../../controllers/admin/catalog.controller.js';

const router = Router();

router.get('/', status);
router.post('/sync', sync);
router.patch('/offers', validate(offerDisabledBody), disableOffer);

export default router;
