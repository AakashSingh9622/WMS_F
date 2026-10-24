"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { EXCEPTION_TYPE_LABEL, useExceptions, useResolveException, type OperationException } from "@/api/exceptions"
import { formatDateTime } from "@/lib/formatting"
import { TriangleAlertIcon } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { PaginationFooter } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"

const PAGE_SIZE = 25

function ResolveDialog({ item }: { item: OperationException }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const resolve = useResolveException()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Resolve</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve: {EXCEPTION_TYPE_LABEL[item.type]}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{item.message}</p>
        <Field>
          <FieldLabel htmlFor={`res-${item.id}`}>What was done</FieldLabel>
          <Textarea id={`res-${item.id}`} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button
            disabled={!text.trim() || resolve.isPending}
            onClick={() =>
              resolve.mutate(
                { id: item.id, resolution: text.trim() },
                {
                  onSuccess: () => {
                    toast.success("Resolved")
                    setOpen(false)
                  },
                  onError: (err) => toast.error(err instanceof Error ? err.message : "Could not resolve"),
                },
              )
            }
          >
            {resolve.isPending ? "Saving…" : "Resolve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Supervisor queue: scans that didn't match, refused at the scanner and kept here to be looked at (spec §6.3). */
export function ExceptionsScreen() {
  const [status, setStatus] = useState<"open" | "resolved">("open")
  const [page, setPage] = useState(1)
  const { data, isLoading } = useExceptions({ status, page, pageSize: PAGE_SIZE })

  return (
    <div className="flex h-full min-h-0 max-w-4xl flex-col gap-4">
      <PageHeader
        icon={TriangleAlertIcon}
        title="Exceptions"
        description="Scans that didn't match — wrong box, unknown barcode, full or locked slot. Check each one and say what was done."
        className="shrink-0"
      />
      <div className="flex shrink-0 gap-2">
        {(["open", "resolved"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? "default" : "outline"}
            onClick={() => {
              setStatus(s)
              setPage(1)
            }}
          >
            {s === "open" ? `Open${data && status === "open" ? ` (${data.total})` : ""}` : "Resolved"}
          </Button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !data?.items.length ? (
          <p className="text-muted-foreground text-sm">
            {status === "open" ? "Nothing waiting — all clear." : "None yet."}
          </p>
        ) : (
          <ul className="bg-card divide-y rounded-2xl border">
            {data.items.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{EXCEPTION_TYPE_LABEL[e.type]}</Badge>
                    {e.orderId && (
                      <Link href={`/app/orders/${e.orderId}`} className="text-primary text-xs hover:underline">
                        {e.orderNumber}
                      </Link>
                    )}
                    {e.boxId && (
                      <Link href={`/app/boxes/${e.boxId}`} className="text-primary font-mono text-xs hover:underline">
                        {e.boxBarcode}
                      </Link>
                    )}
                  </div>
                  <p>{e.message}</p>
                  <p className="text-muted-foreground text-xs">
                    Scanned by {e.createdBy.name}, {formatDateTime(e.createdAt)}
                    {e.resolvedBy && ` · resolved by ${e.resolvedBy.name}: ${e.resolution}`}
                  </p>
                </div>
                {e.status === "open" && <ResolveDialog item={e} />}
              </li>
            ))}
          </ul>
        )}
      </div>
      <PaginationFooter page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  )
}
