import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { settingsPatch } from '../../lib/validation/admin/settings.schema.js';
import * as settings from '../../controllers/admin/settings.controller.js';

const router = Router();

router.get('/', settings.get);
router.patch('/', validate(settingsPatch), settings.patch);

export default router;
