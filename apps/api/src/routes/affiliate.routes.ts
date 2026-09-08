import { Router } from 'express';
import { requireUser } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { acceptTermsBody } from '../lib/validation/affiliate.schema.js';
import * as affiliate from '../controllers/affiliate.controller.js';

const router = Router();
router.use(requireUser);

router.get('/', affiliate.get);
router.post('/accept-terms', validate(acceptTermsBody), affiliate.accept);

export default router;
