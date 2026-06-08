type Subscription = { unsubscribe(): void } | void

export interface ObservableLike<T> {
  subscribe(next: (value: T) => void): Subscription
}

export interface RepoStoreOptions {
  repoId: string
}

export interface RepoStore {
  patches$: ObservableLike<any>
}

export interface RepoEventStore {
  filters(query: Record<string, unknown>): ObservableLike<any>
}

export function createRepoStore(eventStore: RepoEventStore, options: RepoStoreOptions): RepoStore {
  const repoTag = `30617:${options.repoId}`
  const patches$ = eventStore.filters({ kinds: [1617], '#a': [repoTag] })

  return { patches$ }
}
