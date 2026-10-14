interface RouteStubProps {
  title: string
  description?: string
}

/** Placeholder for routes whose screens land in a later phase (spec §11). Proves the route tree, guards, and layouts work before the real UI is built. */
export function RouteStub({ title, description }: RouteStubProps) {
  return (
    <div className="space-y-1">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-muted-foreground text-sm">
        {description ?? "This screen is built in a later phase."}
      </p>
    </div>
  )
}
