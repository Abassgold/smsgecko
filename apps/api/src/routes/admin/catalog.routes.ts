import { Router } from 'express';
import { validate } from '../../middleware/validation.js';
import { idParams } from '../../lib/validation/common.schema.js';
import {
  adminOffersQuery,
  bulkOfferBody,
  createCountryBody,
  createOfferBody,
  createServiceBody,
  updateCountryBody,
  updateOfferBody,
  updateServiceBody,
} from '../../lib/validation/admin/catalog.schema.js';
import * as catalog from '../../controllers/admin/catalog.controller.js';

const router = Router();

/* ---- services ---- */
router.get('/services', catalog.listServices);
router.post('/services', validate(createServiceBody), catalog.createService);
router.patch(
  '/services/:id',
  validate(idParams, 'params'),
  validate(updateServiceBody),
  catalog.updateService,
);
router.delete('/services/:id', validate(idParams, 'params'), catalog.deleteService);

/* ---- countries ---- */
router.get('/countries', catalog.listCountries);
router.post('/countries', validate(createCountryBody), catalog.createCountry);
router.patch(
  '/countries/:id',
  validate(idParams, 'params'),
  validate(updateCountryBody),
  catalog.updateCountry,
);
router.delete('/countries/:id', validate(idParams, 'params'), catalog.deleteCountry);

/* ---- offers ---- */
router.get('/offers', validate(adminOffersQuery, 'query'), catalog.listOffers);
router.post('/offers/bulk', validate(bulkOfferBody), catalog.bulkOffers);
router.post('/offers', validate(createOfferBody), catalog.createOffer);
router.patch(
  '/offers/:id',
  validate(idParams, 'params'),
  validate(updateOfferBody),
  catalog.updateOffer,
);
router.delete('/offers/:id', validate(idParams, 'params'), catalog.deleteOffer);

export default router;
