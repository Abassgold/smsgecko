import express, { Router } from 'express';
import { receive } from '../controllers/sesNotifications.controller.js';

const router = Router();

// SNS delivers with `Content-Type: text/plain`, which the app-wide JSON parser skips.
router.post('/', express.text({ type: 'text/*', limit: '256kb' }), receive);

export default router;
