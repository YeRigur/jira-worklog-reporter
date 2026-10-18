// Just enough of a browser for the page to run under Node: elements that
// remember their children and text, storage, and the window globals the
// extension's export code talks through. Tests and tools/run-page.js use it.

export class FakeNode {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.className = '';
    this.style = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.text = '';
  }
  get classList() {
    const n = this;
    return {
      add: (c) => { if (!n.className.split(' ').includes(c)) n.className = `${n.className} ${c}`.trim(); },
      remove: (c) => { n.className = n.className.split(' ').filter((x) => x !== c).join(' '); },
      toggle: (c) => { if (n.className.split(' ').includes(c)) n.classList.remove(c); else n.classList.add(c); },
      contains: (c) => n.className.split(' ').includes(c)
    };
  }
  set textContent(t) { this.text = String(t); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => (c instanceof FakeNode ? c.textContent : String(c))).join(''); }
  set innerHTML(_) { this.text = ''; this.children = []; }
  get lastChild() { return this.children[this.children.length - 1]; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, event = {}) { for (const fn of this.listeners[type] || []) fn({ target: this, preventDefault() {}, ...event }); }
  append(...c) { this.children.push(...c); }
  replaceChildren(...c) { this.children = c; }
  remove() {}
  click() { this.dispatch('click'); }
  focus() {}
  select() {}
  // Every element below this one, depth first.
  *walk() { for (const c of this.children) if (c instanceof FakeNode) { yield c; yield* c.walk(); } }
  find(test) { for (const n of this.walk()) if (test(n)) return n; return null; }
  findAll(test) { return [...this.walk()].filter(test); }
}

// Installs the browser globals on `target` (globalThis for the module page, a
// vm context for a one-file page). Returns the #app element and the store.
export function installFakeDom(target, { storage = {} } = {}) {
  const app = new FakeNode('div');
  const store = new Map(Object.entries(storage));
  const document = {
    createElement: (t) => new FakeNode(t),
    createTextNode: (t) => String(t),
    getElementById: () => app,
    body: new FakeNode('body'),
    documentElement: { dataset: {} },
    activeElement: null,
    execCommand: () => false
  };
  const globals = {
    document,
    window: target,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    navigator: { clipboard: { writeText: async () => {} } },
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    addEventListener() {},
    location: { search: '' },
    scrollTo() {},
    Node: FakeNode
  };
  // Node's own navigator is a getter on globalThis; define over it.
  for (const [k, v] of Object.entries(globals)) Object.defineProperty(target, k, { value: v, writable: true, configurable: true });
  return { app, store, document };
}
