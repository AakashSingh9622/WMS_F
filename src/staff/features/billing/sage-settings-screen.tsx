"use client"

import { useState } from "react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { useSageSettings, useUpdateSageSettings } from "@/api/invoices"
import { SAGE_TAX_RATES } from "@/api/sage"
import { useCan } from "@/auth/useAuth"
import { formatDateTime } from "@/lib/formatting"
import { Invoice } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { SageConnectionBar, useSageConnection, useSageLedgerAccounts } from "@/staff/features/billing/sage-connection"

export function SageSettingsScreen() {
  const canManage = useCan("billing.manage")
  const connection = useSageConnection()
  const ledgers = useSageLedgerAccounts(connection.connected)
  const { data: settings, isLoading } = useSageSettings()
  const update = useUpdateSageSettings()
  const [draft, setDraft] = useState<{ ledgerId?: string; taxRateId?: string; terms?: string }>({})

  const ledgerId = draft.ledgerId ?? settings?.defaultLedgerAccountId ?? ""
  const taxRateId = draft.taxRateId ?? settings?.defaultTaxRateId ?? "GB_NO_TAX"
  const terms = draft.terms ?? String(settings?.paymentTermsDays ?? 30)
  const termsValid = /^\d+$/.test(terms) && Number(terms) <= 365
  const ledgerName = (id: string) =>
    ledgers.data?.find((l) => l.id === id)?.displayed_as ??
    (id === settings?.defaultLedgerAccountId ? settings?.defaultLedgerAccountName : null) ??
    id
  const taxOptions = SAGE_TAX_RATES.some((t) => t.id === taxRateId)
    ? SAGE_TAX_RATES
    : [...SAGE_TAX_RATES, { id: taxRateId, label: taxRateId }]

  async function save() {
    try {
      await update.mutateAsync({
        defaultLedgerAccountId: ledgerId || null,
        defaultLedgerAccountName: ledgerId ? ledgerName(ledgerId) : null,
        defaultTaxRateId: taxRateId,
        paymentTermsDays: Number(terms),
      })
      setDraft({})
      toast.success("Sage settings saved")
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the Sage settings")
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        icon={Invoice}
        title="Sage One"
        description="Warehouse invoices are created in Sage One through DocuSoft, with the same Sage app as DocuSoft Practice."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Connection (this browser)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <SageConnectionBar connection={connection} />
          <p className="text-muted-foreground text-xs">
            Like DocuSoft Practice, the Sage sign-in is kept in this browser — everyone who sends invoices connects once
            on their own computer. Signing out of the warehouse app forgets it. The Sage app key comes from DocuSoft
            (set up in Practice).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Defaults for every invoice</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading || !settings ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="sage-ledger">Sales ledger account</FieldLabel>
                  <Select
                    value={ledgerId}
                    disabled={!canManage || !connection.connected || ledgers.isLoading}
                    onValueChange={(v) => setDraft((d) => ({ ...d, ledgerId: v ?? "" }))}
                  >
                    <SelectTrigger id="sage-ledger">
                      <SelectValue
                        placeholder="Ask every time"
                        getLabel={(id) => (id ? ledgerName(id) : "Ask every time")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {ledgers.data?.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.displayed_as}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {connection.connected
                      ? ledgers.error
                        ? ledgers.error.message
                        : "Used for invoice lines unless you pick another one when sending."
                      : "Connect to Sage to choose from your ledger accounts."}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="sage-vat">Default VAT rate</FieldLabel>
                  <Select
                    value={taxRateId}
                    disabled={!canManage}
                    onValueChange={(v) => setDraft((d) => ({ ...d, taxRateId: v ?? taxRateId }))}
                  >
                    <SelectTrigger id="sage-vat">
                      <SelectValue getLabel={(id) => taxOptions.find((t) => t.id === id)?.label ?? id} />
                    </SelectTrigger>
                    <SelectContent>
                      {taxOptions.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Suggested on new invoice lines; each line can be changed. DocuSoft Practice always uses “No VAT” —
                    pick Standard if the business is VAT registered.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="sage-terms">Payment terms (days)</FieldLabel>
                  <Input
                    id="sage-terms"
                    type="number"
                    min={0}
                    max={365}
                    inputMode="numeric"
                    disabled={!canManage}
                    value={terms}
                    onChange={(e) => setDraft((d) => ({ ...d, terms: e.target.value }))}
                  />
                  <FieldDescription>Due date = invoice date + this many days.</FieldDescription>
                </Field>
              </FieldGroup>
              {canManage && (
                <div className="flex items-center gap-3">
                  <Button onClick={save} disabled={!termsValid || update.isPending}>
                    {update.isPending ? "Saving…" : "Save"}
                  </Button>
                  {settings.updatedAt && settings.updatedBy && (
                    <span className="text-muted-foreground text-xs">
                      Last changed by {settings.updatedBy.name} on {formatDateTime(settings.updatedAt)}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
