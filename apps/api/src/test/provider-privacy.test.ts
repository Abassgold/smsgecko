import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { applyOtpToOrder } from '../lib/orderLifecycle.js';
import { Order } from '../models/Order.js';
import { SmsMessage } from '../models/SmsMessage.js';

/** Which reseller fulfils an order is admin-only — customers must never see its name. */
async function waitingOrder() {
  return Order.create({
    userId: new Types.ObjectId(),
    serviceId: '1012',
    countryId: '1',
    serviceSlug: '1012',
    serviceName: 'WhatsApp',
    countryName: 'United States',
    countryCode: '1',
    countryFlagEmoji: '🇺🇸',
    phoneNumber: '+15550100',
    priceMicro: 250_000,
    provider: 'sms_pool',
    providerLabel: 'smspool',
    providerRef: 'ref-1',
    status: 'waiting',
    source: 'api',
    expiresAt: new Date(Date.now() + 600_000),
  });
}

describe('SMS sender never names the reseller', () => {
  it.each([
    ['the provider label', 'smspool'],
    ['the adapter key', 'sms_pool'],
    ['a generic placeholder', 'SMS'],
    ['nothing', ''],
  ])('replaces %s with the service name', async (_what, sender) => {
    const order = await waitingOrder();
    await applyOtpToOrder(order, '123456', [{ sender, text: 'Your WhatsApp code is 123-456' }]);
    const [msg] = await SmsMessage.find({ orderId: order._id });
    expect(msg!.sender).toBe('WhatsApp');
  });

  it('keeps a real upstream sender', async () => {
    const order = await waitingOrder();
    await applyOtpToOrder(order, '123456', [{ sender: 'WhatsApp Business', text: 'code 123456' }]);
    const [msg] = await SmsMessage.find({ orderId: order._id });
    expect(msg!.sender).toBe('WhatsApp Business');
  });
});
