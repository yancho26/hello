/* Двете практики в една инсталация.
 *
 * Практиката на общопрактикуващия лекар (ОПЛ) и практиката за специализирана
 * извънболнична помощ (СИМП) са напълно отделни: свои пациенти, потребители,
 * ПИН-ове, копия и журнал. Общи за инсталацията са само продуктовият ключ и
 * достъпът по мрежата (те се пазят при практиката на ОПЛ).
 *
 *   data/          — практиката на ОПЛ (както до версия 3.3)
 *   data/simp/     — практиката на СИМП
 *
 * Папката на СИМП се създава едва когато някой избере СИМП при входа —
 * при кабинет само на ОПЛ тя не съществува.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Store } from './store.js';

export const WORKSPACE_IDS = ['gp', 'simp'];

export class Workspaces {
  /**
   * @param {Store} gp  практиката на ОПЛ (от нея са ключът и мрежовите настройки)
   * @param {string} [simpDir]  папката за СИМП; по подразбиране data/simp
   */
  constructor(gp, simpDir = path.join(gp.dir, 'simp')) {
    this.gp = gp;
    this.simpDir = simpDir;
    this.simpStore = null;
    // Ако вече има практика на СИМП, тя се зарежда веднага (грешка в данните се вижда при стартиране).
    if (fs.existsSync(path.join(simpDir, 'practice.json'))) this.simpStore = this.openSimp();
  }

  /** От папката с данни — както при стартиране на сървъра. */
  static open(dataDir) {
    return new Workspaces(new Store(dataDir, { kind: 'gp' }));
  }

  openSimp() {
    return new Store(this.simpDir, { kind: 'simp', license: this.gp.license });
  }

  /** Настройките на инсталацията (мрежа, разрешени адреси, ключ). */
  get install() { return this.gp; }

  get simp() {
    if (!this.simpStore) this.simpStore = this.openSimp();
    return this.simpStore;
  }

  /** Съществува ли вече практика от този вид (без да я създава). */
  exists(id) {
    return id === 'gp' || !!this.simpStore;
  }

  get(id) {
    return id === 'simp' ? this.simp : this.gp;
  }

  /** Заредените практики — за записа при спиране и за копията. */
  all() {
    return [this.gp, this.simpStore].filter(Boolean);
  }

  noteAppVersion(version) {
    for (const s of this.all()) s.noteAppVersion(version);
  }

  persistSync() {
    for (const s of this.all()) s.persistSync();
  }

  /** Последно външно копие на всяка практика при спиране. */
  copyToExtra(reason) {
    return Promise.all(this.all().filter(s => s.settings.extraBackupDir).map(s => s.copyToExtra(reason)));
  }
}
