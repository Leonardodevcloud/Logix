// Helpers de criação de DOM, sem framework. el('div', {class:'x', onClick:fn}, filhos...)
export function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v != null) e.setAttribute(k, v);
  }
  for (const f of filhos.flat()) e.append(f && f.nodeType ? f : document.createTextNode(f ?? ''));
  return e;
}
export function limpar(container) { container.innerHTML = ''; }
