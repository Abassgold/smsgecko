import { Router } from 'express';
import { requireUser } from '../middleware/auth.js';
import * as notifications from '../controllers/notifications.controller.js';

const router = Router();
router.use(requireUser);

router.get('/', notifications.list);
router.post('/read', notifications.readAll);

export default router;
