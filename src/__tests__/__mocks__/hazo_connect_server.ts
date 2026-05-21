// Static mock for 'hazo_connect/server' used in Jest tests.
// createCrudService receives the fake adapter and returns CRUD operations backed by adapter.rows.

interface FakeAdapter { rows: Array<Record<string, unknown>>; }

export function createCrudService(adapter: FakeAdapter) {
  return {
    async insert(data: Record<string, unknown>) {
      const row = { ...data };
      adapter.rows.push(row);
      return [row];
    },
    async list(buildQuery: (qb: unknown) => unknown) {
      const filters: Array<[string, string, unknown]> = [];
      const qb = {
        where: (col: string, op: string, val: unknown) => { filters.push([col, op, val]); return qb; },
        order: () => qb,
        limit: () => qb,
        offset: () => qb,
      };
      buildQuery(qb);
      return adapter.rows.filter((r) =>
        filters.every(([col, op, val]) =>
          op === 'eq' ? r[col] === val :
          op === 'in' ? Array.isArray(val) && (val as unknown[]).includes(r[col]) :
          true,
        ),
      );
    },
    async findOneBy(criteria: Record<string, unknown>) {
      return adapter.rows.find((r) =>
        Object.entries(criteria).every(([k, v]) => r[k] === v),
      ) ?? null;
    },
    async deleteById(id: unknown) {
      const idx = adapter.rows.findIndex((r) => r['id'] === id);
      if (idx !== -1) adapter.rows.splice(idx, 1);
    },
  };
}
