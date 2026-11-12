/* Темата се нанася преди първото изрисуване на страницата, за да не мига светъл екран, когато
 * е избрана тъмна тема. Обикновен скрипт (не модул), зарежда се в <head> преди стиловете.
 * Предпочитанията са в localStorage под „docup.ui“ — вижте ui/theme.js и shared/ui-prefs.js. */
(function () {
  var root = document.documentElement;
  var prefs = {};
  try { prefs = JSON.parse(localStorage.getItem('docup.ui') || '{}') || {}; } catch (e) { prefs = {}; }
  var theme = prefs.theme;
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-density', prefs.density === 'compact' ? 'compact' : 'normal');
})();
