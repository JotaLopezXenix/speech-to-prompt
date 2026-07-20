import type { ReactNode } from 'react'

export function Placeholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      <div className="text-muted-foreground">{children}</div>
    </section>
  )
}
