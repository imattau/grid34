import { useEffect, useState } from 'react'
import { useRepoStore } from '../contexts/storeContexts'
import { blockComponentRegistry } from '../blocks/registry'
import { LockedPageView } from './LockedPageView'
import type { Page } from '../../storage/repo/types'

export interface PageEditorProps {
  pageId: string
}

interface PageObservation {
  status: 'loading' | 'ready' | 'locked'
  page?: Page
}

export function PageEditor({ pageId }: PageEditorProps) {
  const repoStore = useRepoStore()
  const [observation, setObservation] = useState<PageObservation>({ status: 'loading' })

  useEffect(() => {
    setObservation({ status: 'loading' })
    const subscription = repoStore.observePage(pageId).subscribe(setObservation)
    return () => subscription.unsubscribe()
  }, [repoStore, pageId])

  if (observation.status === 'loading') {
    return <p role="status">Decrypting…</p>
  }

  if (observation.status === 'locked' || !observation.page) {
    return <LockedPageView pageId={pageId} pageTitle={observation.page?.title ?? ''} />
  }

  const page = observation.page

  return (
    <article aria-label={page.title}>
      <div>
        <strong>{page.title}</strong>
      </div>
      {page.blocks
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((block) => {
          const Component = blockComponentRegistry[block.type as keyof typeof blockComponentRegistry]
          if (!Component) return null
          return <Component key={block.id} block={block} pageId={pageId} />
        })}
    </article>
  )
}
