import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import {
  catalogSearchQuery,
  offersQuery,
  quoteQuery,
} from '../lib/validation/catalog.schema.js';
import * as catalog from '../controllers/catalog.controller.js';

const router = Router();

router.get('/services', validate(catalogSearchQuery, 'query'), catalog.listServices);
router.get('/countries', validate(catalogSearchQuery, 'query'), catalog.listCountries);
router.get('/offers', validate(offersQuery, 'query'), catalog.listOffersForPair);
router.get('/quote', validate(quoteQuery, 'query'), catalog.quote);

export default router;
