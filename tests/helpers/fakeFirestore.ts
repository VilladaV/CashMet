/**
 * Minimal in-memory implementation of the Firebase Firestore API surface used by
 * CashMet. It supports batches, runTransaction, increment(), deleteField(),
 * dotted-path updates and simple query/where/orderBy/limit constraints.
 *
 * The goal is to verify repository behaviour (including atomicity and validation)
 * without connecting to a real Firebase project or touching production data.
 */

type DocData = Record<string, unknown>
type Store = Map<string, Map<string, DocData>>

let store: Store = new Map()
let sequence = 0
let txLock: Promise<void> = Promise.resolve()

export interface DocRef {
  __kind: 'doc'
  col: string
  id: string
}

interface ColRef {
  __kind: 'collection'
  col: string
}

interface QueryRef {
  __kind: 'query'
  col: string
  filters: Array<{ field: string; op: string; value: unknown }>
  sorts: Array<{ field: string; dir: 'asc' | 'desc' }>
  max?: number
}

export const increment = (value: number) => ({ __op: 'increment', value })
export const deleteField = () => ({ __op: 'delete' })

function clone<T>(value: T): T {
  return structuredClone(value)
}

function colMap(name: string): Map<string, DocData> {
  let map = store.get(name)
  if (!map) {
    map = new Map()
    store.set(name, map)
  }
  return map
}

function cloneStore(source: Store): Store {
  const copy: Store = new Map()
  for (const [name, docs] of source.entries()) {
    copy.set(name, new Map([...docs.entries()].map(([id, data]) => [id, clone(data)])))
  }
  return copy
}

function snapshot(ref: DocRef, data?: DocData) {
  const exists = data !== undefined
  return {
    id: ref.id,
    ref,
    exists: () => exists,
    data: () => (exists ? clone(data) : undefined),
    get: (field: string) => (exists ? getPath(data!, field) : undefined),
  }
}

function getPath(data: DocData, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, data)
}

function setPath(target: DocData, path: string, value: unknown): void {
  const parts = path.split('.')
  let cursor: Record<string, unknown> = target
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) cursor[key] = {}
    cursor = cursor[key] as Record<string, unknown>
  }
  cursor[parts[parts.length - 1]] = value
}

function applyValue(existing: unknown, value: unknown): unknown {
  if (value && typeof value === 'object' && (value as { __op?: string }).__op === 'increment') {
    return (Number(existing) || 0) + Number((value as { value: number }).value)
  }
  return clone(value)
}

/** Applies an update payload (Firestore update semantics: maps are replaced, not deep-merged). */
function applyUpdate(target: DocData, payload: DocData): void {
  for (const [key, value] of Object.entries(payload)) {
    if (key.includes('.')) {
      setPath(target, key, applyValue(getPath(target, key), value))
      continue
    }
    if (value && typeof value === 'object' && (value as { __op?: string }).__op === 'increment') {
      target[key] = applyValue(target[key], value)
    } else if (value && typeof value === 'object' && (value as { __op?: string }).__op === 'delete') {
      delete target[key]
    } else {
      target[key] = clone(value)
    }
  }
}

function mergeData(existing: DocData | undefined, payload: DocData): DocData {
  const base: DocData = existing ? clone(existing) : {}
  for (const [key, value] of Object.entries(payload)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value as { __op?: string }).__op) {
      const prev = base[key]
      base[key] =
        prev && typeof prev === 'object' && !Array.isArray(prev)
          ? mergeData(prev as DocData, value as DocData)
          : clone(value)
    } else {
      applyUpdate(base, { [key]: value })
    }
  }
  return base
}

function resolveRef(a: unknown, b?: unknown, c?: unknown): DocRef {
  if (a && typeof a === 'object' && (a as DocRef).__kind === 'doc') return a as DocRef
  if (a && typeof a === 'object' && (a as ColRef).__kind === 'collection') {
    // Firestore's doc(collectionRef) generates a unique id when none is given.
    if (b === undefined) {
      sequence += 1
      return { __kind: 'doc', col: (a as ColRef).col, id: `auto-doc-${sequence}` }
    }
    return { __kind: 'doc', col: (a as ColRef).col, id: String(b) }
  }
  return { __kind: 'doc', col: String(b ?? a), id: String(c) }
}

export function collection(_db: unknown, name: string): ColRef {
  return { __kind: 'collection', col: name }
}

export function doc(a: unknown, b?: unknown, c?: unknown): DocRef {
  return resolveRef(a, b, c)
}

export async function getDoc(ref: DocRef) {
  return snapshot(ref, colMap(ref.col).get(ref.id))
}

export function where(field: string, op: string, value: unknown) {
  return { __filter: true, field, op, value }
}

export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
  return { __sort: true, field, dir }
}

export function limit(max: number) {
  return { __limit: true, max }
}

export function query(col: ColRef, ...constraints: unknown[]): QueryRef {
  const q: QueryRef = { __kind: 'query', col: col.col, filters: [], sorts: [] }
  for (const c of constraints) {
    if (c && typeof c === 'object' && (c as { __filter?: boolean }).__filter) {
      const f = c as { field: string; op: string; value: unknown }
      q.filters.push(f)
    } else if (c && typeof c === 'object' && (c as { __sort?: boolean }).__sort) {
      const s = c as { field: string; dir: 'asc' | 'desc' }
      q.sorts.push(s)
    } else if (c && typeof c === 'object' && (c as { __limit?: boolean }).__limit) {
      q.max = (c as { max: number }).max
    }
  }
  return q
}

function matches(data: DocData, filters: QueryRef['filters']): boolean {
  return filters.every((f) => {
    const v = getPath(data, f.field)
    switch (f.op) {
      case '==':
        return v === f.value
      case '!=':
        return v !== f.value
      case '>':
        return (v as number) > (f.value as number)
      case '>=':
        return (v as number) >= (f.value as number)
      case '<':
        return (v as number) < (f.value as number)
      case '<=':
        return (v as number) <= (f.value as number)
      case 'in':
        return Array.isArray(f.value) && (f.value as unknown[]).includes(v)
      default:
        return false
    }
  })
}

export async function getDocs(ref: ColRef | QueryRef) {
  const col = (ref as ColRef).col ?? (ref as QueryRef).col
  const map = colMap(col)
  let rows = [...map.entries()].map(([id, data]) => ({ id, data }))
  if ((ref as QueryRef).__kind === 'query') {
    const q = ref as QueryRef
    rows = rows.filter((r) => matches(r.data, q.filters))
    for (const sort of [...q.sorts].reverse()) {
      rows.sort((a, b) => {
        const av = getPath(a.data, sort.field)
        const bv = getPath(b.data, sort.field)
        if (av === bv) return 0
        if (av === undefined) return 1
        if (bv === undefined) return -1
        const cmp = av < bv ? -1 : 1
        return sort.dir === 'desc' ? -cmp : cmp
      })
    }
    if (typeof q.max === 'number') rows = rows.slice(0, q.max)
  }
  const docs = rows.map((r) => snapshot({ __kind: 'doc', col, id: r.id }, r.data))
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (fn: (d: ReturnType<typeof snapshot>) => void) => docs.forEach(fn),
  }
}

export async function addDoc(col: ColRef, data: DocData) {
  sequence += 1
  const id = `auto-${sequence}`
  colMap(col.col).set(id, clone(data))
  return { __kind: 'doc', col: col.col, id } as DocRef
}

export async function setDoc(ref: DocRef, data: DocData, opts?: { merge?: boolean }) {
  const map = colMap(ref.col)
  const current = map.get(ref.id)
  map.set(ref.id, opts?.merge ? mergeData(current, data) : clone(data))
}

export async function updateDoc(ref: DocRef, data: DocData) {
  const map = colMap(ref.col)
  const current = map.get(ref.id)
  if (!current) {
    throw Object.assign(new Error(`No document to update: ${ref.col}/${ref.id}`), { code: 'not-found' })
  }
  applyUpdate(current, data)
  map.set(ref.id, current)
}

export async function deleteDoc(ref: DocRef) {
  colMap(ref.col).delete(ref.id)
}

interface Op {
  kind: 'set' | 'update' | 'delete'
  ref: DocRef
  data?: DocData
  merge?: boolean
}

function applyOps(target: Store, ops: Op[]): void {
  for (const op of ops) {
    let map = target.get(op.ref.col)
    if (!map) {
      map = new Map()
      target.set(op.ref.col, map)
    }
    if (op.kind === 'set') {
      const current = map.get(op.ref.id)
      map.set(op.ref.id, op.merge ? mergeData(current, op.data!) : clone(op.data!))
    } else if (op.kind === 'update') {
      const current = map.get(op.ref.id)
      if (!current) {
        throw Object.assign(new Error(`No document to update: ${op.ref.col}/${op.ref.id}`), {
          code: 'not-found',
        })
      }
      applyUpdate(current, op.data!)
    } else {
      map.delete(op.ref.id)
    }
  }
}

export function writeBatch(_db: unknown) {
  const ops: Op[] = []
  return {
    set(ref: DocRef, data: DocData, opts?: { merge?: boolean }) {
      ops.push({ kind: 'set', ref, data, merge: opts?.merge })
      return this
    },
    update(ref: DocRef, data: DocData) {
      ops.push({ kind: 'update', ref, data })
      return this
    },
    delete(ref: DocRef) {
      ops.push({ kind: 'delete', ref })
      return this
    },
    async commit() {
      const next = cloneStore(store)
      applyOps(next, ops)
      store = next
    },
  }
}

export function runTransaction<T>(_db: unknown, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  // Firestore retries/serializes concurrent transactions. Serialize them here so
  // double-spend regressions are deterministic in tests.
  const ejecutar = async (): Promise<T> => {
    const working = cloneStore(store)
    const ops: Op[] = []

    const tx: Transaction = {
      async get(ref: DocRef) {
        const data = working.get(ref.col)?.get(ref.id)
        return snapshot(ref, data)
      },
      set(ref, data, opts) {
        ops.push({ kind: 'set', ref, data, merge: opts?.merge })
        const current = working.get(ref.col)?.get(ref.id)
        if (!working.has(ref.col)) working.set(ref.col, new Map())
        working.get(ref.col)!.set(ref.id, opts?.merge ? mergeData(current, data) : clone(data))
        return tx
      },
      update(ref, data) {
        const current = working.get(ref.col)?.get(ref.id)
        if (!current) {
          throw Object.assign(new Error(`No document to update: ${ref.col}/${ref.id}`), { code: 'not-found' })
        }
        ops.push({ kind: 'update', ref, data })
        applyUpdate(current, data)
        return tx
      },
      delete(ref) {
        ops.push({ kind: 'delete', ref })
        working.get(ref.col)?.delete(ref.id)
        return tx
      },
    }

    const result = await fn(tx)
    const next = cloneStore(store)
    applyOps(next, ops)
    store = next
    return result
  }

  const ejecucion = txLock.then(ejecutar, ejecutar)
  txLock = ejecucion.then(
    () => undefined,
    () => undefined,
  )
  return ejecucion
}

export interface Transaction {
  get(ref: DocRef): Promise<ReturnType<typeof snapshot>>
  set(ref: DocRef, data: DocData, opts?: { merge?: boolean }): Transaction
  update(ref: DocRef, data: DocData): Transaction
  delete(ref: DocRef): Transaction
}

// ---------------------------------------------------------------------------
// Test-only helpers
// ---------------------------------------------------------------------------

export function __reset(): void {
  store = new Map()
  sequence = 0
  txLock = Promise.resolve()
}

export function __seed(col: string, id: string, data: DocData): void {
  colMap(col).set(id, clone(data))
}

export function __all(col: string): Array<DocData & { id: string }> {
  return [...colMap(col).entries()].map(([id, data]) => ({ id, ...clone(data) }))
}

export function __get(col: string, id: string): DocData | undefined {
  const data = colMap(col).get(id)
  return data ? clone(data) : undefined
}

export function __size(col: string): number {
  return colMap(col).size
}
