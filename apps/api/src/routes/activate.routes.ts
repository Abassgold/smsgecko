import { Router, urlencoded } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { handlerApi } from '../controllers/activate.controller.js';

/** The SMS-Activate-compatible text API. Both addresses run the same handler; form-encoded POST bodies are accepted too. */
const router = Router();
router.all(['/api/handler_api', '/stubs/handler_api.php'], urlencoded({ extended: false }), asyncHandler(handlerApi));

export default router;
