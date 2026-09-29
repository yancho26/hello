/* Активиране с продуктов ключ (виж license.js). */

import { HttpError, str } from './validate.js';
import { LoginGuard, waitText } from './guard.js';

/** Пътищата, достъпни и преди активирането. */
export const ACTIVATION_ROUTES = new Set(['GET /api/state', 'POST /api/activate']);

export const licenseRoutes = {
  'POST /api/activate': (ctx) => {
    const { store, body } = ctx;
    const license = store.license;
    // Смяна на ключа на вече активирана програма — само от вписан потребител.
    if (license.active && !ctx.doctor) throw new HttpError(401, 'Необходимо е вписване.');

    // Броячът на грешните ключове е общ за инсталацията, не за всяка практика поотделно.
    const inst = ctx.install || store;
    const guard = (inst.activationGuard ??= new LoginGuard());
    const ip = ctx.ip || '';
    const wait = guard.wait('activation', ip);
    if (wait > 0) throw new HttpError(429, `Твърде много невалидни ключове. Опитайте отново след ${waitText(wait)}.`);

    const res = license.activate(str(body.key, 'Продуктов ключ', { required: true, max: 80 }), ctx.doctor);
    if (!res.ok) {
      if (res.reason === 'format') {
        throw new HttpError(400, 'Ключът е въведен непълно или с грешка. Проверете го знак по знак: '
          + 'видът е DOCUP-XXXXX-XXXXX-XXXXX-XXXXX.');
      }
      guard.fail('activation', ip);
      store.audit(ctx.doctor, 'activation_failed', { ip });
      throw new HttpError(403, 'Този продуктов ключ не е валиден за DocUp.');
    }
    guard.success('activation');
    store.audit(ctx.doctor, 'activated', { key: license.info().key });
    return { license: license.info() };
  },
};
