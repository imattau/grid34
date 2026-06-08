export interface LockedPageViewProps {
  pageId: string
  pageTitle: string
}

export function LockedPageView({ pageTitle }: LockedPageViewProps) {
  return (
    <section aria-label="Locked page">
      <h2>🔒 Locked</h2>
      <p>{pageTitle}</p>
      <p>This page is encrypted and your key can&apos;t decrypt it. Ask a workspace maintainer to share access.</p>
    </section>
  )
}
