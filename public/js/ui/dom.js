/* Малък помощник за построяване на DOM.
 *
 * Всичко се сглобява през createElement и textContent, а не през innerHTML —
 * така имена, бележки и диагнози на пациенти не могат да се тълкуват като
 * код, каквото и да е въведено в тях. */

/**
 * h('div.card', { onclick }, дете, дете…)
 * Селекторът поддържа таг, .класове и #идентификатор.
 */
export function h(selector, props, ...children) {
  const [, tag = 'div', rest = ''] = /^([a-zA-Z0-9]*)(.*)$/.exec(selector) || [];
  const el = document.createElement(tag || 'div');

  for (const token of rest.match(/[.#][^.#]+/g) || []) {
    if (token[0] === '.') el.classList.add(token.slice(1));
    else el.id = token.slice(1);
  }

  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }

  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.classList.add(...String(value).split(/\s+/).filter(Boolean));
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'html') el.innerHTML = value;               // само за наши иконки
    else if (key in el && key !== 'list' && key !== 'form') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }

  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (Array.isArray(child)) append(el, child);
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
}

/** Елемент от пространството SVG. */
export function svg(tag, props, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(node, ...children) {
  clear(node);
  append(node, children);
  return node;
}

export const frag = (...children) => {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
};

/** Инициали за кръгчето с потребителя. */
export function initials(name) {
  const parts = String(name || '').replace(/^д-р\s*/i, '').trim().split(/\s+/);
  return ((parts[0] || '')[0] || '?').toUpperCase() + ((parts[1] || '')[0] || '').toUpperCase();
}
