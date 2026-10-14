import Link from "next/link"

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">403 — Forbidden</h1>
      <p className="text-muted-foreground max-w-md">
        You don&apos;t have permission to view this page. If you think this is a mistake, contact
        your administrator.
      </p>
      <Link href="/" className="text-primary underline underline-offset-4">
        Back home
      </Link>
    </div>
  )
}
