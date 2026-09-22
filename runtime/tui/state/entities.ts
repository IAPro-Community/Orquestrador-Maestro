export type EntityState<T extends { id: string }> = Readonly<{
  byId: Readonly<Record<string, T>>;
  ids: readonly string[];
}>;

export function upsertEntity<T extends { id: string }>(state: EntityState<T>, entity: T): EntityState<T> {
  const exists = Object.prototype.hasOwnProperty.call(state.byId, entity.id);
  return Object.freeze({
    byId: Object.freeze({ ...state.byId, [entity.id]: entity }),
    ids: Object.freeze(exists ? [...state.ids] : [...state.ids, entity.id])
  });
}

export function removeEntity<T extends { id: string }>(state: EntityState<T>, id: string): EntityState<T> {
  if (!Object.prototype.hasOwnProperty.call(state.byId, id)) return state;
  const byId = { ...state.byId };
  delete byId[id];
  return Object.freeze({ byId: Object.freeze(byId), ids: Object.freeze(state.ids.filter((entry) => entry !== id)) });
}

export function selectAll<T extends { id: string }>(state: EntityState<T>): T[] {
  return state.ids.map((id) => state.byId[id]).filter((entry): entry is T => Boolean(entry));
}
