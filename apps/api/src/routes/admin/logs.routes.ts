import { Router } from 'express';
import { validate } from '../../middleware/validation.js';
import { adminLogsQuery } from '../../lib/validation/admin/logs.schema.js';
import * as logs from '../../controllers/admin/logs.controller.js';

const router = Router();

router.get('/', validate(adminLogsQuery, 'query'), logs.list);

export default router;
