// Estado leve com pub/sub (sem framework).
const estado = {};
const ouvintes = new Map();

export function definir(chave, valor) {
  estado[chave] = valor;
  (ouvintes.get(chave) || []).forEach((fn) => fn(valor));
}
export function obter(chave) { return estado[chave]; }
export function observar(chave, fn) {
  if (!ouvintes.has(chave)) ouvintes.set(chave, []);
  ouvintes.get(chave).push(fn);
  return () => { const a = ouvintes.get(chave); a.splice(a.indexOf(fn), 1); };
}
