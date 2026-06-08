export interface LockedPageViewProps {
  pageId: string
  pageTitle: string
}

export function LockedPageView({ pageTitle }: LockedPageViewProps) {
  return (
    <section className="locked-page" aria-label="Locked page">
      <p className="page-editor__breadcrumbs">Locked</p>
      <h2>{pageTitle || 'Untitled page'}</h2>
      <p>This page is encrypted and your key can&apos;t decrypt it. Ask a workspace maintainer to share access.</p>
    </section>
  )
}
