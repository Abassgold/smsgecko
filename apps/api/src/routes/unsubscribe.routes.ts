import { Router } from 'express';
import { unsubscribe } from '../controllers/unsubscribe.controller.js';

const router = Router();

router.get('/', unsubscribe);

export default router;
