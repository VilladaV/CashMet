/**
 * Minimal in-memory implementation of the Firebase Firestore API surface used by
 * CashMet. It supports batches, runTransaction (with strict reads-before-writes),
 * increment(), deleteField() (including dotted paths), merge/mergeFields,
 * forbidden-value validation (undefined & nested arrays), and query/where/orderBy/limit.
 *
 * The goal is to verify repository behaviour (including atomicity and validation)
 * without connecting to a real Firebase project or touching production data.
 */

type DocData = Record<string, unknown>
type Store = Map<string, Map<string, DocData>>

let store: Store = new Map()
let sequence = 0
let txLock: Promise<void> = Promise.resolve()
const nextGetDocFailures = new Map<string, Error>()

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

export interface SetOptions {
  merge?: boolean
  mergeFields?: string[]
}

export const increment = (value: number) => ({ __op: 'increment', value })
export const deleteField = () => ({ __op: 'delete' })

function isOpSentinel(value: unknown, op?: 'increment' | 'delete'): boolean {
  if (!value || typeof value !== 'object') return false
  const tag = (value as { __op?: string }).__op
  return op ? tag === op : tag === 'increment' || tag === 'delete'
}

/**
 * Mirrors real Firestore SDK payload validation:
 * - Rejects `undefined` anywhere in the payload (direct or nested).
 * - Rejects directly nested arrays (`[[...]]`).
 */
function validarValorFirestore(value: unknown, path = ''): void {
  if (value === undefined) {
    throw new Error(`Invalid Firestore value: unsupported field value undefined${path ? ` at "${path}"` : ''}`)
  }
  if (value === null || typeof value !== 'object') return
  if (isOpSentinel(value)) return
  if (value instanceof Date) return

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      if (Array.isArray(item)) {
        throw new Error(
          `Invalid Firestore value: nested arrays are not supported${path ? ` at "${path}[${i}]"` : ''}`
        )
      }
      validarValorFirestore(item, `${path}[${i}]`)
    }
    return
  }

  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    validarValorFirestore(v, path ? `${path}.${k}` : k)
  }
}

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

function hasPath(data: DocData, path: string): boolean {
  const parts = path.split('.')
  let cursor: unknown = data
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || !(part in (cursor as Record<string, unknown>))) {
      return false
    }
    cursor = (cursor as Record<string, unknown>)[part]
  }
  return true
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

function deletePath(target: DocData, path: string): void {
  const parts = path.split('.')
  let cursor: unknown = target
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return
    cursor = (cursor as Record<string, unknown>)[parts[i]]
  }
  if (cursor && typeof cursor === 'object' && !Array.isArray(cursor)) {
    delete (cursor as Record<string, unknown>)[parts[parts.length - 1]]
  }
}

function applyValue(existing: unknown, value: unknown): unknown {
  if (isOpSentinel(value, 'increment')) {
    return (Number(existing) || 0) + Number((value as { value: number }).value)
  }
  return clone(value)
}

/** Applies an update payload (Firestore update semantics: maps are replaced, not deep-merged). */
function applyUpdate(target: DocData, payload: DocData): void {
  validarValorFirestore(payload)
  for (const [key, value] of Object.entries(payload)) {
    if (key.includes('.')) {
      if (isOpSentinel(value, 'delete')) {
        deletePath(target, key)
      } else {
        setPath(target, key, applyValue(getPath(target, key), value))
      }
      continue
    }
    if (isOpSentinel(value, 'increment')) {
      target[key] = applyValue(target[key], value)
    } else if (isOpSentinel(value, 'delete')) {
      delete target[key]
    } else {
      target[key] = clone(value)
    }
  }
}

function mergeData(existing: DocData | undefined, payload: DocData): DocData {
  validarValorFirestore(payload)
  const base: DocData = existing ? clone(existing) : {}
  for (const [key, value] of Object.entries(payload)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && !isOpSentinel(value)) {
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

/**
 * Applies Firestore setDoc(..., { mergeFields }) semantics:
 * replaces each listed field completely (no deep merge inside that field)
 * while preserving all other existing fields in the document.
 */
function mergeFieldsData(existing: DocData | undefined, payload: DocData, fields: string[]): DocData {
  validarValorFirestore(payload)
  const base: DocData = existing ? clone(existing) : {}
  for (const field of fields) {
    if (!hasPath(payload, field)) continue
    const value = getPath(payload, field)
    if (field.includes('.')) {
      if (isOpSentinel(value, 'delete')) {
        deletePath(base, field)
      } else {
        setPath(base, field, applyValue(getPath(base, field), value))
      }
    } else if (isOpSentinel(value, 'delete')) {
      delete base[field]
    } else if (isOpSentinel(value, 'increment')) {
      base[field] = applyValue(base[field], value)
    } else {
      base[field] = clone(value)
    }
  }
  return base
}

function applySetData(existing: DocData | undefined, payload: DocData, opts?: SetOptions): DocData {
  validarValorFirestore(payload)
  if (opts?.mergeFields) return mergeFieldsData(existing, payload, opts.mergeFields)
  if (opts?.merge) return mergeData(existing, payload)
  return clone(payload)
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
  const key = `${ref.col}/${ref.id}`
  const err = nextGetDocFailures.get(key)
  if (err) {
    nextGetDocFailures.delete(key)
    throw err
  }
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
  validarValorFirestore(data)
  sequence += 1
  const id = `auto-${sequence}`
  colMap(col.col).set(id, clone(data))
  return { __kind: 'doc', col: col.col, id } as DocRef
}

export async function setDoc(ref: DocRef, data: DocData, opts?: SetOptions) {
  const map = colMap(ref.col)
  const current = map.get(ref.id)
  map.set(ref.id, applySetData(current, data, opts))
}

export async function updateDoc(ref: DocRef, data: DocData) {
  validarValorFirestore(data)
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
  opts?: SetOptions
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
      map.set(op.ref.id, applySetData(current, op.data!, op.opts))
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
    set(ref: DocRef, data: DocData, opts?: SetOptions) {
      validarValorFirestore(data)
      ops.push({ kind: 'set', ref, data, opts })
      return this
    },
    update(ref: DocRef, data: DocData) {
      validarValorFirestore(data)
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
  // Firestore retries/serializes concurrent transactions and enforces reads before writes.
  const ejecutar = async (): Promise<T> => {
    const working = cloneStore(store)
    const ops: Op[] = []
    let yaEscribio = false

    const tx: Transaction = {
      async get(ref: DocRef) {
        if (yaEscribio) {
          throw new Error('Firestore transactions require all reads to be executed before all writes')
        }
        const data = working.get(ref.col)?.get(ref.id)
        return snapshot(ref, data)
      },
      set(ref, data, opts) {
        validarValorFirestore(data)
        yaEscribio = true
        ops.push({ kind: 'set', ref, data, opts })
        const current = working.get(ref.col)?.get(ref.id)
        if (!working.has(ref.col)) working.set(ref.col, new Map())
        working.get(ref.col)!.set(ref.id, applySetData(current, data, opts))
        return tx
      },
      update(ref, data) {
        validarValorFirestore(data)
        yaEscribio = true
        const current = working.get(ref.col)?.get(ref.id)
        if (!current) {
          throw Object.assign(new Error(`No document to update: ${ref.col}/${ref.id}`), { code: 'not-found' })
        }
        ops.push({ kind: 'update', ref, data })
        applyUpdate(current, data)
        return tx
      },
      delete(ref) {
        yaEscribio = true
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
    () => undefined
  )
  return ejecucion
}

export interface Transaction {
  get(ref: DocRef): Promise<ReturnType<typeof snapshot>>
  set(ref: DocRef, data: DocData, opts?: SetOptions): Transaction
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
  nextGetDocFailures.clear()
}

export function __failNextGetDoc(col: string, id: string, error: Error): void {
  nextGetDocFailures.set(`${col}/${id}`, error)
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
