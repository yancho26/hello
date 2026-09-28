/* Проверка за стар браузър.
 *
 * Обикновен скрипт (не модул), написан така, че да работи и в Internet
 * Explorer: ако браузърът не може да изпълни програмата, вместо празен екран
 * лекарят вижда какво да направи. */
(function () {
  var started = false;
  window.__dkStarted = function () { started = true; };

  var OLD = 'Браузърът е твърде стар за програмата. Отворете същия адрес в Google Chrome, '
    + 'Microsoft Edge или Mozilla Firefox (последна версия).';

  function show(text) {
    var root = document.getElementById('root');
    if (!root || started) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    var box = document.createElement('div');
    box.className = 'boot-error';
    var title = document.createElement('h1');
    title.appendChild(document.createTextNode('Програмата не може да се отвори'));
    var p = document.createElement('p');
    p.appendChild(document.createTextNode(text));
    var addr = document.createElement('p');
    addr.className = 'boot-address';
    addr.appendChild(document.createTextNode(location.href));
    box.appendChild(title);
    box.appendChild(p);
    box.appendChild(addr);
    root.appendChild(box);
  }

  if (!('noModule' in document.createElement('script'))) {
    document.addEventListener('DOMContentLoaded', function () { show(OLD); });
    return;
  }
  // Браузър, който поддържа модули, но не и по-новия синтаксис на програмата.
  window.addEventListener('error', function (e) {
    if (!started && e && /SyntaxError/.test(String(e.message)) && /\/js\//.test(String(e.filename || ''))) show(OLD);
  });
  setTimeout(function () {
    show('Програмата не се зареди. Презаредете страницата (F5). Ако съобщението се появи отново, '
      + 'проверете дали програмата работи на основния компютър или отворете адреса в Google Chrome или Microsoft Edge.');
  }, 20000);
})();
