import { Router } from 'express';
import * as overview from '../../controllers/admin/overview.controller.js';

const router = Router();

router.get('/', overview.overview);

export default router;
