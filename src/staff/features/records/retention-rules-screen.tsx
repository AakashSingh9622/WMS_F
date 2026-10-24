"use client"

import { useState } from "react"
import { toast } from "sonner"

import {
  RETENTION_TRIGGER_LABEL,
  retentionTriggerSchema,
  useRetentionRules,
  useSaveRetentionRule,
  type RetentionRule,
  type RetentionTrigger,
} from "@/api/records"
import { useCan } from "@/auth/useAuth"
import { formatDateTime } from "@/lib/formatting"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

/** New rule, or a new version of an existing one (pass `rule`). Saving never edits a version in place. */
function RuleDialog({ rule }: { rule?: RetentionRule }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState(rule?.code ?? "")
  const [name, setName] = useState(rule?.name ?? "")
  const [years, setYears] = useState(String(rule?.retentionYears ?? 7))
  const [trigger, setTrigger] = useState<RetentionTrigger>(rule?.trigger ?? "filing_date_to")
  const save = useSaveRetentionRule()
  const valid = code.trim() && name.trim() && /^\d+$/.test(years)

  async function submit() {
    try {
      const saved = await save.mutateAsync({
        code: code.trim(),
        name: name.trim(),
        retentionYears: Number(years),
        trigger,
      })
      toast.success(`${saved.code} v${saved.version} saved`)
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the rule")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant={rule ? "outline" : "default"} />}>
        {rule ? "New version" : "Add rule"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{rule ? `New version of ${rule.code}` : "Add a retention rule"}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="rr-code">Category code</FieldLabel>
            <Input
              id="rr-code"
              value={code}
              disabled={!!rule}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <FieldDescription>What boxes carry, e.g. TAX, HR, LEGAL-12.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="rr-name">Name</FieldLabel>
            <Input id="rr-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field>
              <FieldLabel htmlFor="rr-years">Keep for (years)</FieldLabel>
              <Input
                id="rr-years"
                type="number"
                min={0}
                max={200}
                value={years}
                onChange={(e) => setYears(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="rr-trigger">Counted from</FieldLabel>
              <Select value={trigger} onValueChange={(v) => setTrigger((v as RetentionTrigger) ?? trigger)}>
                <SelectTrigger id="rr-trigger">
                  <SelectValue getLabel={(v) => RETENTION_TRIGGER_LABEL[v as RetentionTrigger]} />
                </SelectTrigger>
                <SelectContent>
                  {retentionTriggerSchema.options.map((t) => (
                    <SelectItem key={t} value={t}>
                      {RETENTION_TRIGGER_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={submit} disabled={!valid || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Retention rules (spec §4.4): how long boxes of each category are kept. Versioned — older versions stay listed. */
export function RetentionRulesScreen() {
  const canManage = useCan("records.manage")
  const [history, setHistory] = useState(false)
  const { data, isLoading } = useRetentionRules(history)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground text-sm">
          A box with a category may be destroyed once its years have passed — unless a legal hold covers it. A
          box&apos;s own &quot;destroy after&quot; date wins over the rule.
        </p>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setHistory((h) => !h)}>
            {history ? "Current only" : "Show all versions"}
          </Button>
          {canManage && <RuleDialog />}
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !data?.length ? (
        <p className="text-muted-foreground text-sm">No retention rules yet.</p>
      ) : (
        <div className="bg-card rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Keep for</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Saved</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id} className={r.isCurrent ? "" : "text-muted-foreground"}>
                  <TableCell className="font-mono">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>
                    {r.retentionYears} years {RETENTION_TRIGGER_LABEL[r.trigger]}
                  </TableCell>
                  <TableCell>
                    v{r.version}
                    {r.isCurrent ? " (current)" : ""}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.createdBy.name}, {formatDateTime(r.createdAt)}
                  </TableCell>
                  <TableCell>{canManage && r.isCurrent && <RuleDialog rule={r} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
