"use client"

import { useState } from "react"
import { toast } from "sonner"

import { RECORD_REQUEST_KIND_LABELS, RECORD_REQUEST_STATUS_LABELS, useCorrectRecordRequest, type RecordRequest } from "@/api/recordRequests"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  CORRECTION_STATUS_LABELS,
  canSwitchKind,
  correctionImpact,
  otherKind,
  statusChoices,
  type CorrectionTarget,
} from "@/domain/record-request-correction"

/**
 * Docbox "Modificar Peticiones" — fix a request after the fact: its STATUS (cancelled by the client, a loan or return done by mistake…)
 * or its KIND (a digital copy instead of the paper). Two separate operations, a required reason, and a plain description of what
 * happens to the physical records before anything is confirmed. A refusal from the server (409: a record is in another request,
 * no longer on loan…) is shown here and nothing was changed.
 */
export function CorrectRequestDialog({ request, open, onOpenChange }: { request: RecordRequest; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {/* keyed by open so a reopened dialog starts clean */}
        {open && <Form key={request.id + request.status + request.kind} request={request} close={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function Form({ request, close }: { request: RecordRequest; close: () => void }) {
  const correct = useCorrectRecordRequest(request.id)
  const kindOk = canSwitchKind(request)
  const choices = statusChoices(request)
  const [op, setOp] = useState<"status" | "kind">("status")
  const [to, setTo] = useState<CorrectionTarget | "">("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")

  const impact = op === "kind" ? (kindOk ? correctionImpact(request, { op: "kind" }) : []) : to ? correctionImpact(request, { op: "status", to }) : []
  const ready = reason.trim().length > 0 && (op === "kind" ? kindOk : !!to)

  const apply = () => {
    setError("")
    const input = op === "kind" ? { kind: otherKind(request.kind), reason: reason.trim() } : { to: to as CorrectionTarget, reason: reason.trim() }
    correct.mutate(input, {
      onSuccess: () => {
        toast.success(`${request.requestNumber}: ${op === "kind" ? `now a ${RECORD_REQUEST_KIND_LABELS[otherKind(request.kind)].toLowerCase()} request` : `corrected to ${CORRECTION_STATUS_LABELS[to as CorrectionTarget].toLowerCase()}`}.`)
        close()
      },
      onError: (err) => setError(err instanceof Error ? err.message : "The correction failed"),
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Correct {request.requestNumber}</DialogTitle>
        <DialogDescription>
          Now: {RECORD_REQUEST_KIND_LABELS[request.kind].toLowerCase()}, {RECORD_REQUEST_STATUS_LABELS[request.status].toLowerCase()}. Use this to fix a request after the fact — not for the normal steps.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex gap-2" role="group" aria-label="What to correct">
          <Button type="button" size="sm" variant={op === "status" ? "default" : "outline"} aria-pressed={op === "status"} onClick={() => { setOp("status"); setError("") }}>
            Change the status
          </Button>
          <Button type="button" size="sm" variant={op === "kind" ? "default" : "outline"} aria-pressed={op === "kind"} onClick={() => { setOp("kind"); setError("") }}>
            Switch original / digital
          </Button>
        </div>

        {op === "status" ? (
          <Field>
            <FieldLabel htmlFor="cr-status">New status</FieldLabel>
            <Select value={to} onValueChange={(v) => { setTo((v ?? "") as CorrectionTarget | ""); setError("") }}>
              <SelectTrigger id="cr-status">
                <SelectValue placeholder="Choose the new status" getLabel={(v) => CORRECTION_STATUS_LABELS[v as CorrectionTarget] ?? v} />
              </SelectTrigger>
              <SelectContent>
                {choices.map((s) => (
                  <SelectItem key={s} value={s}>
                    {CORRECTION_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : kindOk ? (
          <p className="text-sm">
            Switch this request from <b>{RECORD_REQUEST_KIND_LABELS[request.kind].toLowerCase()}</b> to <b>{RECORD_REQUEST_KIND_LABELS[otherKind(request.kind)].toLowerCase()}</b>.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm" data-testid="kind-unavailable">
            The kind can only be switched while the request is accepted or delivered. This one is {request.status}: reopen it first (change the status), then switch.
          </p>
        )}

        {impact.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="correct-impact">
            <p className="mb-1 font-medium">What will happen</p>
            <ul className="list-disc space-y-1 pl-5">
              {impact.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        <Field>
          <FieldLabel htmlFor="cr-reason">Reason (required)</FieldLabel>
          <Textarea
            id="cr-reason"
            rows={2}
            maxLength={500}
            placeholder="Why is this being corrected? It is kept in the history."
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError("") }}
          />
        </Field>

        {error && (
          <p role="alert" data-testid="correct-error" className="text-destructive rounded-md border border-red-300 bg-red-50 p-3 text-sm">
            {error} Nothing was changed.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={close} disabled={correct.isPending}>
          Cancel
        </Button>
        <Button onClick={apply} disabled={!ready || correct.isPending}>
          {correct.isPending ? "Applying…" : "Apply correction"}
        </Button>
      </DialogFooter>
    </>
  )
}
