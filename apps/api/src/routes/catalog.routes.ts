import { Router } from 'express';
import { validate } from '../middleware/validation.js';
import {
  catalogSearchQuery,
  offersQuery,
  operatorsQuery,
  quoteQuery,
} from '../lib/validation/catalog.schema.js';
import {
  listCountries,
  listOffersForPair,
  listOperatorsForPair,
  listServices,
  quote,
} from '../controllers/catalog.controller.js';

const router = Router();

router.get('/services', validate(catalogSearchQuery, 'query'), listServices);
router.get('/countries', validate(catalogSearchQuery, 'query'), listCountries);
router.get('/operators', validate(operatorsQuery, 'query'), listOperatorsForPair);
router.get('/offers', validate(offersQuery, 'query'), listOffersForPair);
router.get('/quote', validate(quoteQuery, 'query'), quote);

export default router;
