import type { RecordRequestKind, RecordRequestStatus } from "@/api/recordRequests"

/**
 * Docbox "Modificar Peticiones": correcting a request after the fact. The record's physical status FOLLOWS the request (original
 * requests only; a digital request never moves a record) — this mirrors the server's rules so the screen can say what will happen
 * before anyone confirms. The server stays the judge: it refuses what can't be done (409) and changes nothing then.
 */
export type CorrectionTarget = "requested" | "delivered" | "returned" | "cancelled"
export const CORRECTION_STATUS_LABELS: Record<CorrectionTarget, string> = {
  requested: "Accepted (not delivered yet)",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
}

type Shape = { kind: RecordRequestKind; status: RecordRequestStatus }
const isOpen = (s: RecordRequestStatus) => s === "requested" || s === "delivered"
const loanOf = (kind: RecordRequestKind, s: RecordRequestStatus) => kind === "original" && isOpen(s) // records are on loan
const lockOf = (kind: RecordRequestKind, s: RecordRequestStatus) => s === "requested" || (s === "delivered" && kind === "original") // records are held

/** A correction can't start from a pending request (that one is Accepted or Cancelled instead). */
export const canCorrect = (r: { status: RecordRequestStatus }) => r.status !== "pending"

/** The new statuses to choose from: not the current one, and a digital request has nothing to return. */
export function statusChoices(r: Shape): CorrectionTarget[] {
  return (["requested", "delivered", "returned", "cancelled"] as const).filter((s) => s !== r.status && !(r.kind === "digital" && s === "returned"))
}

/** The kind can only be switched while the request is accepted or delivered. */
export const canSwitchKind = (r: Shape) => isOpen(r.status)
export const otherKind = (k: RecordRequestKind): RecordRequestKind => (k === "original" ? "digital" : "original")

/** What will happen, in plain words, for the chosen correction. */
export function correctionImpact(r: Shape, change: { op: "status"; to: CorrectionTarget } | { op: "kind" }): string[] {
  const out: string[] = []
  if (change.op === "kind") {
    const to = otherKind(r.kind)
    if (to === "digital") {
      out.push("The paper is no longer lent: the records go back to storage (archived).")
      out.push(r.status === "delivered" ? "The request becomes finished (delivered) and the records are released for new requests." : "The records stay held for this request until the digital copy is delivered.")
      out.push("The client is told they will get a digital copy.")
    } else {
      out.push("The records are put on loan now and held for this request. They must all be archived and free of any other open request — if even one isn't, nothing changes.")
      out.push("The client is told they will get the original paper.")
    }
  } else {
    const kind = r.kind
    const hadLoan = loanOf(kind, r.status)
    const wantLoan = loanOf(kind, change.to)
    const hadLock = lockOf(kind, r.status)
    const wantLock = lockOf(kind, change.to)
    if (hadLoan && !wantLoan) {
      out.push("The records still out go back to storage (archived) and can be requested again.")
      if (change.to === "returned") out.push("Every record of the request is marked as returned.")
    } else if (!hadLoan && wantLoan) {
      out.push("Every record is put on loan again and held for this request. They must all be archived and free of any other open request — if even one isn't, nothing changes.")
    } else if (kind === "digital") {
      out.push("A digital request never moves the paper: no record changes status.")
    } else if (isOpen(r.status) && isOpen(change.to)) {
      out.push("Only the delivery date changes: the records stay on loan.")
    } else {
      out.push("Nothing physical changes: the records stay in storage.")
    }
    if (kind === "digital" && wantLock && !hadLock) out.push("The records are held for this request again (they must be free of any other open request).")
    if (kind === "digital" && hadLock && !wantLock) out.push("The records are released and can be requested again.")
    if (change.to === "cancelled") out.push("The client is told the request was cancelled.")
  }
  out.push("It is written to the request's history and to each record's history, with your reason.")
  return out
}
