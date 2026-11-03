import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;

export function createMemoryFirestore() {
  const documents = new Map<string, Data>();
  const events: string[] = [];
  const faults = { beforeCommit: false, afterCommit: false };
  const isDelete = (value: unknown) =>
    value instanceof FieldValue && value.isEqual(FieldValue.delete());
  const normalize = (value: unknown): unknown => {
    if (value instanceof FieldValue && value.isEqual(FieldValue.serverTimestamp()))
      return Timestamp.now();
    if (value instanceof Timestamp || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(normalize);
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalize(entry)]));
  };
  const snapshot = (ref: Reference) => {
    const data = documents.get(ref.path);
    return { id: ref.id, ref, exists: data !== undefined, data: () => data };
  };
  type Write = { ref: Reference; operation: 'create' | 'update' | 'delete'; data?: Data };
  const apply = (writes: Write[]) => {
    const next = new Map(documents);
    for (const { ref, operation, data = {} } of writes) {
      if (operation === 'create' && next.has(ref.path)) throw new Error('Already exists');
      if (operation === 'update' && !next.has(ref.path))
        throw Object.assign(new Error('Missing'), { code: 5 });
      if (operation === 'delete') {
        next.delete(ref.path);
        continue;
      }
      const result = operation === 'update' ? { ...next.get(ref.path) } : {};
      for (const [key, value] of Object.entries(data)) {
        if (isDelete(value)) delete result[key];
        else result[key] = normalize(value);
      }
      next.set(ref.path, result);
    }
    documents.clear();
    next.forEach((data, path) => documents.set(path, data));
  };
  let sequence = 0;
  class Reference {
    constructor(readonly path: string) {}
    get id() {
      return this.path.split('/').at(-1)!;
    }
    async get() {
      return snapshot(this);
    }
    async create(data: Data) {
      apply([{ ref: this, operation: 'create', data }]);
    }
    async update(data: Data) {
      apply([{ ref: this, operation: 'update', data }]);
    }
    async delete() {
      apply([{ ref: this, operation: 'delete' }]);
    }
  }
  class Query {
    private filters: [string, unknown][] = [];
    private orders: { field: string; direction: string }[] = [];
    private count = Infinity;
    private boundary?: [Timestamp, string];
    constructor(readonly name: string) {}
    doc(id = `generated-${++sequence}`) {
      return new Reference(`${this.name}/${id}`);
    }
    async add(data: Data) {
      const ref = this.doc();
      await ref.create(data);
      return ref;
    }
    private copy() {
      const next = new Query(this.name);
      next.filters = [...this.filters];
      next.orders = [...this.orders];
      next.count = this.count;
      next.boundary = this.boundary;
      return next;
    }
    where(field: string, operator: string, value: unknown) {
      if (operator !== '==') throw new Error('Unsupported test query');
      const next = this.copy();
      next.filters.push([field, value]);
      return next;
    }
    orderBy(field: unknown, direction: string) {
      const next = this.copy();
      next.orders.push({ field: typeof field === 'string' ? field : '__name__', direction });
      return next;
    }
    limit(count: number) {
      const next = this.copy();
      next.count = count;
      return next;
    }
    startAfter(timestamp: Timestamp, id: string) {
      const next = this.copy();
      next.boundary = [timestamp, id];
      return next;
    }
    async get() {
      const compare = (a: unknown, b: unknown) => {
        if (a instanceof Timestamp && b instanceof Timestamp)
          return a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;
        return String(a).localeCompare(String(b));
      };
      let docs = [...documents.keys()]
        .filter((path) => path.startsWith(`${this.name}/`))
        .map((path) => snapshot(new Reference(path)));
      docs = docs.filter((doc) =>
        this.filters.every(([field, value]) => doc.data()?.[field] === value)
      );
      if (this.orders.length)
        docs.sort((a, b) => {
          for (const { field, direction } of this.orders) {
            const order = compare(
              field === '__name__' ? a.id : a.data()?.[field],
              field === '__name__' ? b.id : b.data()?.[field]
            );
            if (order) return direction === 'desc' ? -order : order;
          }
          return 0;
        });
      const boundary = this.boundary;
      if (boundary)
        docs = docs.filter((doc) => {
          const order = compare(doc.data()?.createdAt, boundary[0]);
          return order < 0 || (order === 0 && doc.id < boundary[1]);
        });
      docs = docs.slice(0, this.count);
      return { docs, empty: docs.length === 0, size: docs.length };
    }
  }
  let previous: Promise<unknown> = Promise.resolve();
  const database = {
    collection: (name: string) => new Query(name),
    runTransaction<T>(
      action: (transaction: {
        get: <R extends Reference | Query>(ref: R) => Promise<unknown>;
        create: (ref: Reference, data: Data) => void;
        update: (ref: Reference, data: Data) => void;
        delete: (ref: Reference) => void;
      }) => Promise<T>
    ): Promise<T> {
      const operation = previous.then(async () => {
        const writes: Write[] = [];
        const result = await action({
          get: async (ref) => {
            if (writes.length) throw new Error('Transaction reads must precede writes');
            events.push(`read:${ref instanceof Reference ? ref.path : ref.name}`);
            return ref.get();
          },
          create: (ref, data) => {
            writes.push({ ref, operation: 'create', data });
          },
          update: (ref, data) => {
            writes.push({ ref, operation: 'update', data });
          },
          delete: (ref) => {
            writes.push({ ref, operation: 'delete' });
          },
        });
        if (faults.beforeCommit && writes.length) {
          faults.beforeCommit = false;
          throw new Error('Persistence failed');
        }
        apply(writes);
        events.push(...writes.map((write) => `${write.operation}:${write.ref.path}`));
        if (faults.afterCommit && writes.length) {
          faults.afterCommit = false;
          throw new Error('Response lost after commit');
        }
        return result;
      });
      previous = operation.catch(() => {});
      return operation;
    },
  };
  return { db: database as unknown as Firestore, documents, events, faults };
}
