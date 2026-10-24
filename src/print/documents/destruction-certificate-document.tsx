"use client"

/* eslint-disable @next/next/no-img-element -- a print page; next/image adds nothing here */
import { useOrderCertificate } from "@/api/records"
import { formatDate, formatDateTime } from "@/lib/formatting"
import { Button } from "@/components/ui/button"

const METHOD_LABEL: Record<string, string> = { shred: "Shredding", pulp: "Pulping", incinerate: "Incineration" }

/**
 * Certificate of destruction (spec §4.4): issued once, when the destruction order is completed, and frozen — this page
 * prints the stored snapshot, not the live order, so it reads the same however often it is reprinted.
 */
export function DestructionCertificateDocument({ orderId }: { orderId: string }) {
  const { data: cert, isLoading, error } = useOrderCertificate(orderId)

  if (isLoading) return <p className="text-muted-foreground p-8 text-sm">Loading…</p>
  if (error || !cert)
    return (
      <p className="text-muted-foreground p-8 text-sm">
        No certificate for this order — one is issued when a destruction order is completed.
      </p>
    )

  const c = cert.content
  return (
    <div className="mx-auto max-w-[190mm] space-y-6 bg-white p-8 text-sm text-black print:p-0">
      <div className="flex justify-end print:hidden">
        <Button onClick={() => window.print()}>Print</Button>
      </div>

      <header className="flex items-start justify-between gap-6 border-b pb-4">
        <div>
          <img src="/login/logo.png" alt="DocuSoft" className="h-12 w-auto" />
          <h1 className="mt-3 text-2xl font-semibold">Certificate of Destruction</h1>
        </div>
        <dl className="text-right text-xs">
          <dt className="text-black/60">Certificate no.</dt>
          <dd className="font-mono text-base font-semibold">{cert.certificateNumber}</dd>
          <dt className="mt-2 text-black/60">Issued</dt>
          <dd>{formatDateTime(cert.issuedAt)}</dd>
        </dl>
      </header>

      <p>
        This certifies that the records listed below, held on behalf of <strong>{c.clientName}</strong>, were securely
        destroyed by <strong>{METHOD_LABEL[c.method] ?? c.method}</strong> on{" "}
        <strong>{formatDateTime(c.destroyedAt)}</strong>
        {c.place ? ` at ${c.place}` : ""}, under order {c.orderNumber}. The records are not recoverable.
      </p>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-2">
        <div>
          <dt className="text-xs text-black/60">Authorised by the client</dt>
          <dd>
            {c.authorisedBy}, {formatDate(c.authorisedAt)}
          </dd>
        </div>
        {c.approvedBy && (
          <div>
            <dt className="text-xs text-black/60">Approved (records manager)</dt>
            <dd>
              {c.approvedBy}
              {c.approvedAt ? `, ${formatDate(c.approvedAt)}` : ""}
            </dd>
          </div>
        )}
        {c.destroyedBy && (
          <div>
            <dt className="text-xs text-black/60">Destroyed by</dt>
            <dd>{c.destroyedBy}</dd>
          </div>
        )}
        {c.witness && (
          <div>
            <dt className="text-xs text-black/60">Witness</dt>
            <dd>{c.witness}</dd>
          </div>
        )}
      </dl>

      <section>
        <h2 className="mb-2 font-semibold">Boxes destroyed ({c.boxes.length})</h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 pr-2">Box</th>
              <th className="py-1 pr-2">Barcode</th>
              <th className="py-1 pr-2">Description</th>
              <th className="py-1 pr-2">Reference</th>
              <th className="py-1 pr-2">Filing dates</th>
              <th className="py-1">Category</th>
            </tr>
          </thead>
          <tbody>
            {c.boxes.map((b) => (
              <tr key={b.boxNumber} className="border-b border-black/10 align-top break-inside-avoid">
                <td className="py-1 pr-2 font-mono">{b.boxNumber}</td>
                <td className="py-1 pr-2 font-mono">{b.barcode}</td>
                <td className="py-1 pr-2">{b.description}</td>
                <td className="py-1 pr-2">{b.reference ?? ""}</td>
                <td className="py-1 pr-2 whitespace-nowrap">
                  {b.filingDateFrom ? formatDate(b.filingDateFrom) : ""}
                  {b.filingDateTo ? ` – ${formatDate(b.filingDateTo)}` : ""}
                </td>
                <td className="py-1">{b.retentionCategory ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Signed by the person who marked the boxes destroyed (signature copied when the certificate was issued). */}
      <footer className="grid grid-cols-2 items-end gap-12 pt-10 break-inside-avoid">
        <div>
          <div className="flex h-20 items-end">
            {c.destroyedBySignature && (
              <img src={c.destroyedBySignature.image} alt="Signature" className="max-h-20 max-w-full object-contain" />
            )}
          </div>
          <div className="border-t pt-1 text-xs text-black/60">
            Signed for DocuSoft{c.destroyedBy ? ` — ${c.destroyedBy}` : ""}
          </div>
        </div>
        <div>
          <div className="flex h-20 items-end pb-1 text-sm">{formatDate(c.destroyedAt)}</div>
          <div className="border-t pt-1 text-xs text-black/60">Date</div>
        </div>
      </footer>
    </div>
  )
}
