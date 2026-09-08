import { Router } from 'express';
import { requireAdmin, requireUser } from '../../middleware/auth.js';
import overviewRoutes from './overview.routes.js';
import providerRoutes from './providers.routes.js';
import userRoutes from './users.routes.js';
import orderRoutes from './orders.routes.js';
import financeRoutes from './finance.routes.js';
import settingsRoutes from './settings.routes.js';

/** Everything under /api/v1/admin, gated by requireUser + requireAdmin. */
const router = Router();

router.use(requireUser, requireAdmin);

router.use('/overview', overviewRoutes);
router.use('/providers', providerRoutes);
router.use('/users', userRoutes);
router.use('/orders', orderRoutes);
router.use('/finance', financeRoutes);
router.use('/settings', settingsRoutes);

export default router;
