import { Router } from 'express';
import { requireAdmin, requireUser } from '../../middleware/auth.js';
import { adminOverviewRouter } from './overview.routes.js';
import { adminProviderRouter } from './providers.routes.js';
import { adminUserRouter } from './users.routes.js';
import { adminOrderRouter } from './orders.routes.js';
import { adminCatalogRouter } from './catalog.routes.js';
import { adminFinanceRouter } from './finance.routes.js';
import { adminSettingsRouter } from './settings.routes.js';

/** Everything under /api/v1/admin, gated by requireUser + requireAdmin. */
export const adminRouter = Router();

adminRouter.use(requireUser, requireAdmin);

adminRouter.use('/overview', adminOverviewRouter);
adminRouter.use('/providers', adminProviderRouter);
adminRouter.use('/users', adminUserRouter);
adminRouter.use('/orders', adminOrderRouter);
adminRouter.use('/catalog', adminCatalogRouter);
adminRouter.use('/finance', adminFinanceRouter);
adminRouter.use('/settings', adminSettingsRouter);
