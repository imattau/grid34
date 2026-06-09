export interface ViewSpec {
  databaseId: string
  columns?: string[]
  seedRows?: Record<string, Record<string, unknown>>
  filter?: Record<string, unknown>
  sort?: { property: string; direction: 'asc' | 'desc' }
}

export interface Row {
  id: string
  values: Record<string, unknown>
}
