// Firestore en memoria (lo mínimo de la API compat/admin que usa ImpactOS).
let auto = 0;
export function fakeDb(seed = {}) {
  const data = new Map(Object.entries(seed)); // path → objeto
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const docRef = (path) => ({
    id: path.split("/").pop(), path,
    collection: (n) => colRef(`${path}/${n}`),
    get: async () => snap(path),
    set: async (v, o) => write(path, v, o),
    update: async (v) => upd(path, v),
    delete: async () => { data.delete(path); },
  });
  const snap = (path) => ({ id: path.split("/").pop(), exists: data.has(path), data: () => clone(data.get(path)), ref: docRef(path) });
  const write = (path, v, o) => { data.set(path, o?.merge ? { ...(data.get(path) || {}), ...clone(v) } : clone(v)); };
  const upd = (path, v) => { if (!data.has(path)) throw new Error("no existe " + path); data.set(path, { ...data.get(path), ...clone(v) }); };
  const colRef = (path, filters = [], lim = null) => ({
    path,
    doc: (id) => docRef(`${path}/${id ?? "auto" + ++auto}`),
    where: (f, op, v) => colRef(path, [...filters, [f, op, v]], lim),
    limit: (n) => colRef(path, filters, n),
    get: async () => query(path, filters, lim),
    _q: true,
  });
  const query = (path, filters, lim) => {
    let docs = [...data.keys()].filter((k) => k.startsWith(path + "/") && !k.slice(path.length + 1).includes("/")).map(snap);
    docs = docs.filter((d) => filters.every(([f, op, v]) => op === "==" ? d.data()[f] === v : true));
    if (lim) docs = docs.slice(0, lim);
    return { docs, empty: docs.length === 0, size: docs.length };
  };
  const db = {
    _data: data,
    collection: (n) => colRef(n),
    batch: () => { const ops = []; return { set: (r, v, o) => ops.push(() => write(r.path, v, o)), update: (r, v) => ops.push(() => upd(r.path, v)), delete: (r) => ops.push(() => data.delete(r.path)), commit: async () => ops.forEach((f) => f()) }; },
    runTransaction: async (fn) => {
      const ops = []; let wrote = false;
      const t = {
        get: async (r) => { if (wrote) throw new Error("lectura después de escritura en transacción"); return r._q ? r.get() : r.get(); },
        set: (r, v, o) => { wrote = true; ops.push(() => write(r.path, v, o)); },
        update: (r, v) => { wrote = true; ops.push(() => upd(r.path, v)); },
        create: (r, v) => { wrote = true; ops.push(() => { if (data.has(r.path)) throw new Error("ya existe"); write(r.path, v); }); },
      };
      const out = await fn(t);
      ops.forEach((f) => f());
      return out;
    },
  };
  return db;
}
