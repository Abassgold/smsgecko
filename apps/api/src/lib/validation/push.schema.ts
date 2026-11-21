import * as yup from 'yup';

export const pushSubscribeBody = yup.object({
  endpoint: yup.string().url().max(1000).required(),
  keys: yup
    .object({
      p256dh: yup.string().max(200).required(),
      auth: yup.string().max(100).required(),
    })
    .required(),
});

export const pushUnsubscribeBody = yup.object({
  endpoint: yup.string().max(1000).required(),
});
