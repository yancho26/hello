/* Справочните таблици (лекарства, заболявания, изследвания…) се създават без
 * прототип. Така ключ, дошъл отвън — „toString“, „constructor“, „__proto__“ —
 * не намира вграден метод на Object и не минава проверката за допустима стойност. */

export const table = (entries) => Object.setPrototypeOf(entries, null);
