import { Router } from 'express';
import { unsubscribe, unsubscribeOneClick } from '../controllers/unsubscribe.controller.js';

const router = Router();

router.get('/', unsubscribe);
router.post('/', unsubscribeOneClick);

export default router;
