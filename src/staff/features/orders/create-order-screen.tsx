"use client"

import { ClipboardList } from "@/components/icons"
import { PageHeader } from "@/components/page-header"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { useBoxSearch } from "@/api/boxes"
import { useDebounce } from "@/hooks/useDebounce"
import { useClientContacts } from "@/hooks/useClientCard"
import { useAppSelector } from "@/store/hooks"
import { projectIdOf, useGetClientsWithDetailsQuery } from "@/store/docusoftApi"
import { useCreateOrder } from "@/api/orders"
import { BoxPicker } from "@/components/box-picker"
import { OrderTypeLabel } from "@/components/order-type-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { OrderType } from "@/api/types"

const ORDER_TYPES: { type: OrderType; description: string }[] = [
  { type: "collection", description: "Bring boxes into the warehouse — new or returning." },
  { type: "dispatch", description: "Send stored boxes out to the client." },
  { type: "destruction", description: "Destroy boxes, with client authorisation." },
  { type: "digitize", description: "Scan stored boxes into digital files, with client authorisation." },
]

const BOX_PAGE_SIZE = 50

export function CreateOrderScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [type, setType] = useState<OrderType | null>((searchParams.get("type") as OrderType) || null)
  // Started from a client's page (its "New order" button) or from a client-scoped selection: the order is for THAT
  // client only, so the client picker is locked (same as the Register boxes wizard).
  const lockedClientId = searchParams.get("clientId") ?? ""
  const [clientId, setClientId] = useState(lockedClientId)
  const pickedClient = useAppSelector((state) => state.clientsUi.selectedClient)
  const [boxIds, setBoxIds] = useState<string[]>([])
  const [address, setAddress] = useState("")
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [expectedNewBoxes, setExpectedNewBoxes] = useState("0")
  const [scheduledFor, setScheduledFor] = useState("")
  const [notes, setNotes] = useState("")
  const [permanentWithdrawal, setPermanentWithdrawal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: clients } = useGetClientsWithDetailsQuery()
  const createOrder = useCreateOrder()

  // Contacts of the chosen client, from the DocuSoft client card already cached in Redux (see useClientContacts).
  const clientContacts = useClientContacts(clientId, projectIdOf(clients?.find((c) => c.ClientId === clientId)))
  const pickableContacts = useMemo(() => {
    const seen = new Set<string>()
    return clientContacts.contacts.filter((c) => {
      const email = c.email.toLowerCase()
      if (!email || seen.has(email)) return false // a contact without an email cannot own an order
      seen.add(email)
      return true
    })
  }, [clientContacts.contacts])
  // The contact is ALWAYS one of the chosen client's DocuSoft contacts (picked, never typed), used exactly as DocuSoft
  // has it — so no email format check here.
  const contactEmailOk = contactEmail.trim() !== ""

  const needsBoxPicker = type === "dispatch" || type === "destruction" || type === "digitize"

  // Box picker: searched + paged on the server (50 per page), so a client with thousands of boxes works. By
  // default only boxes that can actually go on this order type are listed.
  const [boxQuery, setBoxQuery] = useState("")
  const [boxPage, setBoxPage] = useState(1)
  const [showAllBoxes, setShowAllBoxes] = useState(false)
  const debouncedBoxQuery = useDebounce(boxQuery, 300)
  const boxSearch = useMemo(
    () => ({
      clientId,
      q: debouncedBoxQuery || undefined,
      // Which boxes the list offers: collection takes boxes that are out; dispatch/destruction take stored (or digitized) ones;
      // digitize takes stored boxes only (an already digitized box has nothing left to scan).
      status: showAllBoxes
        ? undefined
        : type === "collection"
          ? ["out" as const]
          : type === "digitize"
            ? ["stored" as const]
            : ["stored" as const, "digitized" as const],
      page: boxPage,
      pageSize: BOX_PAGE_SIZE,
    }),
    [clientId, debouncedBoxQuery, showAllBoxes, boxPage, type],
  )
  const { data: clientBoxes, isFetching: searchingBoxes } = useBoxSearch(boxSearch, {
    enabled: !!clientId && !!type,
  })
  const boxPickerServer = {
    query: boxQuery,
    onQueryChange: (q: string) => {
      setBoxQuery(q)
      setBoxPage(1)
    },
    total: clientBoxes?.total ?? 0,
    page: boxPage,
    pageSize: BOX_PAGE_SIZE,
    onPageChange: setBoxPage,
    loading: searchingBoxes && !clientBoxes,
    showAll: showAllBoxes,
    onShowAllChange: (v: boolean) => {
      setShowAllBoxes(v)
      setBoxPage(1)
    },
  }

  async function submit() {
    if (!type || !clientId) return
    setError(null)
    try {
      const clientName = clients?.find((c) => c.ClientId === clientId)?.Client ?? clientId
      const order = await createOrder.mutateAsync({
        type,
        clientId,
        clientName,
        boxIds: needsBoxPicker ? boxIds : type === "collection" ? boxIds : undefined,
        expectedNewBoxes: type === "collection" ? Number(expectedNewBoxes) || 0 : undefined,
        address: type !== "dispatch" ? address || undefined : undefined,
        contactName: contactName || undefined,
        contactEmail: contactEmail.trim().toLowerCase(),
        scheduledFor: scheduledFor || undefined,
        notes: notes || undefined,
        permanentWithdrawal: type === "dispatch" ? permanentWithdrawal : undefined,
      })
      toast.success(`Order ${order.orderNumber} created`)
      router.push(`/app/orders/${order.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the order")
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader icon={ClipboardList} title="Create order" description="Choose the type, the client and the boxes." />

      {!type && (
        <div className="grid gap-3 sm:grid-cols-3">
          {ORDER_TYPES.map((opt) => (
            <button
              key={opt.type}
              type="button"
              onClick={() => setType(opt.type)}
              className="hover:border-primary/50 rounded-lg border p-4 text-left transition-colors"
            >
              <OrderTypeLabel type={opt.type} />
              <p className="text-muted-foreground mt-2 text-sm">{opt.description}</p>
            </button>
          ))}
        </div>
      )}

      {type && (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <div className="flex items-center justify-between">
              <OrderTypeLabel type={type} />
              <Button variant="ghost" size="sm" onClick={() => setType(null)}>
                Change type
              </Button>
            </div>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="client">Client</FieldLabel>
                <Select
                  value={clientId}
                  disabled={!!lockedClientId}
                  onValueChange={(v) => {
                    setClientId(v ?? "")
                    // the contact belongs to the client, so a new client means picking the contact again
                    setContactName("")
                    setContactEmail("")
                  }}
                >
                  <SelectTrigger id="client">
                    <SelectValue
                      placeholder="Choose a client"
                      getLabel={(id) =>
                        clients?.find((c) => c.ClientId === id)?.Client ??
                        (pickedClient?.ClientID === id ? pickedClient.Client : id)
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((c) => (
                      <SelectItem key={c.ClientId} value={c.ClientId}>
                        {c.Client}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {lockedClientId && (
                  <p className="text-muted-foreground text-xs">
                    The client is fixed because you started from its page. To order for another client, start from that
                    client.
                  </p>
                )}
              </Field>

              {clientId && type === "collection" && (
                <>
                  <Field>
                    <FieldLabel htmlFor="address">Address</FieldLabel>
                    <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="expected">Expected new boxes</FieldLabel>
                    <Input
                      id="expected"
                      type="number"
                      min={0}
                      value={expectedNewBoxes}
                      onChange={(e) => setExpectedNewBoxes(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Returning boxes (currently out with this client)</FieldLabel>
                    <BoxPicker
                      boxes={clientBoxes?.items ?? []}
                      type="collection"
                      selectedIds={boxIds}
                      onChange={setBoxIds}
                      server={boxPickerServer}
                    />
                  </Field>
                </>
              )}

              {clientId && needsBoxPicker && (
                <Field>
                  <FieldLabel>Boxes</FieldLabel>
                  <BoxPicker
                    boxes={clientBoxes?.items ?? []}
                    type={type}
                    selectedIds={boxIds}
                    onChange={setBoxIds}
                    server={boxPickerServer}
                  />
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="contact">Contact</FieldLabel>
                {!clientId ? (
                  <p className="text-muted-foreground text-xs">Choose a client first.</p>
                ) : clientContacts.isLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : pickableContacts.length > 0 ? (
                  <>
                    <Select
                      value={contactEmail}
                      onValueChange={(email) => {
                        const picked = pickableContacts.find((c) => c.email === email)
                        setContactEmail(email ?? "")
                        setContactName(picked?.name ?? "")
                      }}
                    >
                      <SelectTrigger id="contact">
                        <SelectValue
                          placeholder="Choose the contact this order is for"
                          getLabel={(email) => {
                            const c = pickableContacts.find((x) => x.email === email)
                            return c ? `${c.name} — ${c.email}` : email
                          }}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {pickableContacts.map((c) => (
                          <SelectItem key={c.id} value={c.email}>
                            {c.name} — {c.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-muted-foreground text-xs">
                      The order is saved against this client and this contact&apos;s email — that is what the contact
                      sees when they log in.
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    {clientContacts.isError
                      ? "Could not load this client's contacts from DocuSoft. Try again in a moment."
                      : "This client has no contact with an email address in DocuSoft. Add one there first — an order has to be for one of the client's contacts."}
                  </p>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="scheduled">Scheduled date</FieldLabel>
                <Input
                  id="scheduled"
                  type="date"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              </Field>

              {type === "dispatch" && (
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={permanentWithdrawal}
                    onCheckedChange={(v) => setPermanentWithdrawal(!!v)}
                  />
                  <span>
                    <span className="font-medium">Permanent withdrawal</span>
                    <span className="text-muted-foreground block text-xs">
                      The client keeps these boxes for good — they leave storage and can&apos;t come back on a
                      collection.
                    </span>
                  </span>
                </label>
              )}

              <Field>
                <FieldLabel htmlFor="notes">Notes</FieldLabel>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>

              <FieldError errors={error ? [{ message: error }] : undefined} />

              <Button
                type="button"
                onClick={submit}
                disabled={
                  !clientId || !contactEmailOk || createOrder.isPending || (needsBoxPicker && boxIds.length === 0)
                }
              >
                {createOrder.isPending ? "Creating…" : "Create order"}
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
