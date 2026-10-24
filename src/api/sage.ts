import { callDocusoft } from "@/store/docusoftApi"

// Sage One (Sage Accounting v3.1) — called from the BROWSER, the same way DocuSoft Practice does it
// (C:\Aakash Singh\SAGE_ONE_INTEGRATION_REPORT.md): every call goes to DocuSoft's proxy at digitalpractice.net/sageone,
// with the access token inside the JSON body. Tokens live in this browser's localStorage; the Sage app key/secret come
// from DocuSoft (Json_GetSageCredentials) — the same Sage app Practice uses, so its registered redirect page is reused.
// This is the ONE copy of the Sage code in the WMS (Practice has four; report finding 6).
//
// Differences from Practice, on purpose:
//  * errors are thrown with Sage's own message, never swallowed (finding 8);
//  * the sign-in popup only opens from an explicit "Connect to Sage" click (popups opened after an await get blocked);
//  * the contact address uses the client's real town (finding 3) and VAT is chosen per line (finding 4).

export const SAGE_CONFIG = {
  authorizeUrl: "https://www.sageone.com/oauth2/auth/central",
  proxyBase: "https://digitalpractice.net/sageone",
  // Practice's redirect page posts the code back to whoever opened the popup (postMessage "*"); we only accept it
  // from that page's origin.
  redirectUri: "https://accountancy.mydocusoft.com/account/sageOneRedirect.html",
  redirectOrigin: "https://accountancy.mydocusoft.com",
  appBase: "https://accounts-extra.sageone.com",
  // Where a practice admin switches the active accounting system (Practice → Settings → Integrations).
  practiceSettingsUrl: "https://accountancy.mydocusoft.com/account/settings.html",
}

export class SageError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = "SageError"
    this.code = code
  }
}

/** Thrown when there's no usable Sage sign-in in this browser — the UI shows "Connect to Sage". */
export const NOT_CONNECTED = "not_connected"

/** Thrown when Sage One isn't the practice's active accounting system — the UI shows the admin / non-admin warning. */
export const SAGE_NOT_ACTIVE = "sage_not_active"

// --- Sage app key/secret (DocuSoft) -----------------------------------------------------------------------------

interface SageAppCredentials {
  clientId: string
  clientSecret: string
}
let appCredentials: SageAppCredentials | null = null

function tableRows(data: unknown, table = "Table"): Record<string, unknown>[] {
  const parsed = typeof data === "string" ? JSON.parse(data) : data
  const rows = (parsed as Record<string, unknown> | null)?.[table]
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
}

async function getAppCredentials(): Promise<SageAppCredentials> {
  if (appCredentials) return appCredentials
  const row = tableRows(await callDocusoft("Json_GetSageCredentials"))[0]
  const clientId = String(row?.SageClientId ?? "").trim()
  const clientSecret = String(row?.SageClientSecret ?? "").trim()
  if (!clientId || !clientSecret) {
    throw new SageError(
      "Sage One is not set up for this DocuSoft agreement. Connect Sage One in DocuSoft Practice first.",
    )
  }
  appCredentials = { clientId, clientSecret }
  return appCredentials
}

// --- Practice's active accounting system --------------------------------------------------------------------------

export type AccountingSystem = "Xero" | "QuickBooks" | "Gusto" | "SageOne" | "SilverFin"

const isOn = (v: unknown) => v === true || v === 1 || String(v).toLowerCase() === "true"

/**
 * The practice's active accounting system (null = none), read from DocuSoft's Json_GetXeroQBDetails with the same flags,
 * in the same order, as Practice's settings page (thirdPartIntegration.js). Read fresh every time: an admin may switch
 * it in Practice and come straight back to try again.
 */
export async function getActiveAccountingSystem(): Promise<AccountingSystem | null> {
  const row = tableRows(await callDocusoft("Json_GetXeroQBDetails"))[0]
  if (!row) return null
  if (isOn(row.IsXero)) return "Xero"
  if (isOn(row.IsQB)) return "QuickBooks"
  if (isOn(row.IsGusto)) return "Gusto"
  if (isOn(row.IsSageOne)) return "SageOne"
  if (isOn(row.IsSilverFin)) return "SilverFin"
  return null
}

/** Stops with SAGE_NOT_ACTIVE unless Sage One is the practice's active accounting system. */
export async function assertSageOneIsActive(): Promise<void> {
  if ((await getActiveAccountingSystem()) !== "SageOne") {
    throw new SageError("Sage One is not your practice's active accounting system", SAGE_NOT_ACTIVE)
  }
}

// --- Tokens (this browser) ------------------------------------------------------------------------------------------

const KEYS = {
  access: "wms_sage_access_token",
  accessExpiry: "wms_sage_access_token_expiry",
  refresh: "wms_sage_refresh_token",
  refreshExpiry: "wms_sage_refresh_token_expiry",
}
const SAFETY_MS = 60_000

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function stillValid(expiryKey: string): boolean {
  return Number(read(expiryKey) ?? 0) - SAFETY_MS > Date.now()
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  refresh_token_expires_in?: number
}

function saveTokens(t: TokenResponse) {
  if (!t.access_token) throw new SageError("Sage did not return an access token")
  const now = Date.now()
  localStorage.setItem(KEYS.access, t.access_token)
  localStorage.setItem(KEYS.accessExpiry, String(now + (t.expires_in ?? 55 * 60) * 1000))
  if (t.refresh_token) {
    localStorage.setItem(KEYS.refresh, t.refresh_token)
    localStorage.setItem(KEYS.refreshExpiry, String(now + (t.refresh_token_expires_in ?? 29 * 24 * 60 * 60) * 1000))
  }
  window.dispatchEvent(new Event(SAGE_SESSION_EVENT))
}

/** Forget this browser's Sage sign-in (Disconnect). */
export function clearSageTokens() {
  try {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k))
  } catch {
    // storage blocked — nothing stored either
  }
  businessCache = null
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SAGE_SESSION_EVENT))
}

/** Is there a Sage sign-in in this browser that can still be used (directly or by refreshing)? */
export function hasSageSession(): boolean {
  return (
    (!!read(KEYS.access) && stillValid(KEYS.accessExpiry)) || (!!read(KEYS.refresh) && stillValid(KEYS.refreshExpiry))
  )
}

const SAGE_SESSION_EVENT = "wms-sage-session"

/** Calls `onChange` whenever the Sage sign-in is saved or cleared (this tab or another one). For useSyncExternalStore. */
export function subscribeSageSession(onChange: () => void): () => void {
  window.addEventListener(SAGE_SESSION_EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(SAGE_SESSION_EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

// The proxy answers { status, data } — token calls sometimes put the tokens at the top level instead (report §2.5).
function tokenFields(json: unknown): TokenResponse {
  const j = json as { data?: TokenResponse } & TokenResponse
  return j?.data?.access_token ? j.data : j
}

let refreshing: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refreshToken = read(KEYS.refresh)
  if (!refreshToken || !stillValid(KEYS.refreshExpiry)) throw new SageError("Sign in to Sage first", NOT_CONNECTED)
  refreshing ??= (async () => {
    try {
      const { clientId, clientSecret } = await getAppCredentials()
      const json = await proxyPost("refreshSageAccessToken", {
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      })
      saveTokens(tokenFields(json))
      return read(KEYS.access) as string
    } catch (err) {
      // A refresh token Sage no longer accepts is useless — drop it so the UI asks to connect again.
      clearSageTokens()
      throw err instanceof SageError && err.code === NOT_CONNECTED
        ? err
        : new SageError(
            `Your Sage sign-in has expired — connect to Sage again (${err instanceof Error ? err.message : err})`,
            NOT_CONNECTED,
          )
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** A usable access token: cached → refreshed. Never opens a popup — throws NOT_CONNECTED instead. */
export async function getSageAccessToken(): Promise<string> {
  const access = read(KEYS.access)
  if (access && stillValid(KEYS.accessExpiry)) return access
  return refreshAccessToken()
}

/**
 * Sign in to Sage in a popup and keep the tokens in this browser. MUST be called straight from a click handler: the
 * popup is opened before any await so the browser doesn't block it.
 */
export async function connectSage(): Promise<void> {
  const popup = window.open("about:blank", "wms_sage_signin", "width=600,height=700")
  if (!popup) throw new SageError("The Sage sign-in window was blocked — allow pop-ups for this site and try again")
  try {
    const { clientId, clientSecret } = await getAppCredentials()
    const state = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    const url = new URL(SAGE_CONFIG.authorizeUrl)
    url.search = new URLSearchParams({
      filter: "apiv3.1",
      response_type: "code",
      client_id: clientId,
      redirect_uri: SAGE_CONFIG.redirectUri,
      scope: "full_access",
      state,
    }).toString()
    popup.location.href = url.toString()

    const code = await new Promise<string>((resolve, reject) => {
      const closedTimer = window.setInterval(() => {
        if (popup.closed) {
          cleanup()
          reject(new SageError("The Sage sign-in window was closed before signing in finished"))
        }
      }, 500)
      function onMessage(event: MessageEvent) {
        if (event.origin !== SAGE_CONFIG.redirectOrigin) return
        const authCode = (event.data as { sageOneAuthCode?: string } | null)?.sageOneAuthCode
        if (authCode === undefined) return
        cleanup()
        if (authCode) resolve(authCode)
        else reject(new SageError("Sage did not return a sign-in code — access may have been denied"))
      }
      function cleanup() {
        window.clearInterval(closedTimer)
        window.removeEventListener("message", onMessage)
      }
      window.addEventListener("message", onMessage)
    })

    const json = await proxyPost("generateSageAccessToken", {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: SAGE_CONFIG.redirectUri,
    })
    clearSageTokens()
    saveTokens(tokenFields(json))
  } catch (err) {
    if (!popup.closed) popup.close()
    throw err
  }
}

// --- Proxy calls -------------------------------------------------------------------------------------------------

interface SageErrorItem {
  $message?: string
  $dataCode?: string
  $source?: string // the field Sage means, e.g. "main_address.address_line_1" or "invoice_lines.0.ledger_account_id"
}

const FIELD_LABEL: Record<string, string> = {
  address_line_1: "address line 1",
  postal_code: "postcode",
  contact_id: "client (Sage contact)",
  ledger_account_id: "ledger account",
  tax_rate_id: "VAT rate",
  unit_price: "unit price",
  due_date: "due date",
  contact_type_ids: "contact type",
}

/** "main_address.address_line_1" -> "address line 1 (main address)", "invoice_lines.0.unit_price" -> "unit price (line 1)". */
function fieldLabel(source: string): string {
  const parts = source.split(".")
  const field = parts[parts.length - 1]
  const label = FIELD_LABEL[field] ?? field.replace(/_/g, " ")
  const line = parts.findIndex((p) => /^\d+$/.test(p))
  if (line > 0) return `${label} (line ${Number(parts[line]) + 1})`
  return parts.length > 1 ? `${label} (${parts[0].replace(/_/g, " ")})` : label
}

/** Every error Sage returned, each with the field it is about — "This field is required" alone doesn't say which. */
function errorText(errors: SageErrorItem[]): string {
  const texts = errors
    .filter((e) => e.$message)
    .map((e) => (e.$source ? `${e.$message!.replace(/\.$/, "")}: ${fieldLabel(e.$source)}` : e.$message!))
  return [...new Set(texts)].join("; ")
}

function errorItems(json: unknown): SageErrorItem[] {
  const j = json as { error?: unknown; data?: unknown } | unknown[]
  if (Array.isArray(j)) return j as SageErrorItem[]
  const fromError = (j as { error?: unknown })?.error
  if (Array.isArray(fromError)) return fromError as SageErrorItem[]
  const fromData = (j as { data?: unknown })?.data
  if (Array.isArray(fromData) && (fromData[0] as SageErrorItem)?.$dataCode) return fromData as SageErrorItem[]
  return []
}

/** Raw POST to the proxy. Throws SageError with Sage's own message when the proxy reports a failure. */
async function proxyPost(api: string, body: Record<string, unknown>): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`${SAGE_CONFIG.proxyBase}/${api}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    })
  } catch {
    throw new SageError("Could not reach Sage — check the internet connection and try again")
  }
  const json = await res.json().catch(() => null)
  const errors = errorItems(json)
  if (!res.ok || (json as { status?: boolean } | null)?.status === false || errors.length > 0) {
    throw new SageError(errorText(errors) || `Sage request failed (${api}, HTTP ${res.status})`, errors[0]?.$dataCode)
  }
  return json
}

/** Authenticated call: adds the access token; if Sage says it expired, refreshes once and retries. Returns `data`. */
async function sagePost<T>(api: string, body: Record<string, unknown> = {}): Promise<T> {
  const call = async (token: string) =>
    ((await proxyPost(api, { ...body, access_token: token })) as { data?: T }).data as T
  try {
    return await call(await getSageAccessToken())
  } catch (err) {
    if (err instanceof SageError && err.code === "AccessTokenExpiredError") {
      localStorage.removeItem(KEYS.access)
      return call(await refreshAccessToken())
    }
    throw err
  }
}

// --- Business, ledger accounts ------------------------------------------------------------------------------------

export interface SageBusiness {
  id: string
  name?: string
}
let businessCache: SageBusiness | null = null

export async function getSageBusiness(): Promise<SageBusiness> {
  if (businessCache) return businessCache
  const data = await sagePost<{
    $items?: { id: string; name?: string; displayed_as?: string }[]
    id?: string
    name?: string
  }>("getBusinesses")
  const first = data?.$items?.[0]
  const id = first?.id ?? data?.id
  if (!id) throw new SageError("No Sage business found for this sign-in")
  businessCache = { id, name: first?.name ?? first?.displayed_as ?? data?.name }
  return businessCache
}

export interface SageLedgerAccount {
  id: string
  displayed_as: string
}

export async function getSageLedgerAccounts(businessId: string): Promise<SageLedgerAccount[]> {
  const data = await sagePost<{ $items?: SageLedgerAccount[] }>("getLedgerAccounts", { business_id: businessId })
  return (data?.$items ?? []).filter((a) => a.id)
}

// --- Contacts (DocuSoft client ⇄ Sage contact via the client's CCode, shared with Practice) ----------------------

/** The Sage contact id DocuSoft stores on the client (CCode), or "" if the client isn't linked yet. */
export async function getLinkedSageContactId(projectId: number, clientId: string): Promise<string> {
  const row = tableRows(
    await callDocusoft("Json_GetSupplierListByProjectOrgNo", { ProjectId: projectId, OrgNo: clientId }),
  )[0]
  return String(row?.CCode ?? "").trim()
}

/** Save the Sage contact id on the DocuSoft client (CCode) so Practice and the WMS use the same contact. */
export async function linkSageContact(projectId: number, clientId: string, contactId: string): Promise<void> {
  await callDocusoft("Json_UpdateClientField", {
    projectid: projectId,
    ClientId: clientId,
    fieldName: "CCode",
    fieldValue: contactId,
  })
}

export interface SageContactInput {
  name: string
  reference: string // the DocuSoft client id (OriginatorNo) — how the contact is found again
  address?: { line1?: string; line2?: string; city?: string; postcode?: string }
}

/** A Sage contact whose reference is this DocuSoft client id (e.g. made by Practice but never linked), or null. */
export async function findSageContactByReference(reference: string): Promise<string | null> {
  const data = await sagePost<{
    contacts?: { id: string; reference?: string }[]
    $items?: { id: string; reference?: string }[]
  }>("getContacts", {
    business_id: "",
    items_per_page: 20,
    page: 1,
    search: reference,
    filter_inactive_contacts: false,
    attributes: "all",
  })
  const contacts = data?.contacts ?? data?.$items ?? []
  return contacts.find((c) => String(c.reference ?? "").trim() === reference)?.id ?? null
}

export async function createSageContact(input: SageContactInput): Promise<string> {
  try {
    const data = await sagePost<{ id?: string }>("createContact", {
      contact: {
        name: input.name,
        contact_type_ids: ["CUSTOMER"],
        reference: input.reference,
        main_address: {
          address_line_1: input.address?.line1 ?? "",
          address_line_2: input.address?.line2 ?? "",
          city: input.address?.city ?? "",
          postal_code: input.address?.postcode ?? "",
          country_id: "GB",
          address_type_id: "ACCOUNTS",
          name: "accounts",
          country_group_id: "GBIE",
          is_main_address: true,
        },
      },
    })
    if (!data?.id) throw new SageError("Sage did not return the new contact's id")
    return data.id
  } catch (err) {
    if (err instanceof SageError && /must be unique/i.test(err.message)) {
      throw new SageError(
        `${input.name} already exists in Sage One under another reference — link it in DocuSoft Practice first`,
      )
    }
    throw err
  }
}

// --- Invoices -----------------------------------------------------------------------------------------------------

export interface SageInvoiceLine {
  description: string
  ledger_account_id: string
  quantity: number
  unit_price: number
  tax_rate_id: string
}

export interface SageInvoiceInput {
  business_id: string
  contact_id: string
  date: string // YYYY-MM-DD
  due_date: string
  reference: string
  notes?: string
  invoice_lines: SageInvoiceLine[]
}

export interface SageInvoiceRef {
  id: string
  invoiceNumber?: string
  link: string
  totalAmount?: number // incl. VAT, as Sage worked it out
  currency?: string
}

interface SageInvoiceData {
  id?: string
  invoice_number?: string
  displayed_as?: string
  reference?: string
  status?: { displayed_as?: string }
  links?: { rel?: string; href?: string }[]
  total_amount?: number | string
  currency?: { id?: string }
}

function invoiceRef(data: SageInvoiceData): SageInvoiceRef {
  const id = data.id as string
  return {
    id,
    invoiceNumber: data.invoice_number || undefined,
    link:
      data.links?.find((l) => l.rel === "alternate")?.href ?? `${SAGE_CONFIG.appBase}/invoicing/sales_invoices/${id}`,
    totalAmount:
      Number.isFinite(Number(data.total_amount)) && data.total_amount !== undefined
        ? Number(data.total_amount)
        : undefined,
    currency: data.currency?.id || undefined,
  }
}

/** An existing (not void) Sage invoice for this contact with exactly this reference — used before creating one. */
export async function findSageInvoiceByReference(
  businessId: string,
  contactId: string,
  reference: string,
): Promise<SageInvoiceRef | null> {
  const data = await sagePost<{ $items?: SageInvoiceData[] }>("getSalesInvoices", {
    business_id: businessId,
    items_per_page: 50,
    page: 1,
    search: reference,
    contact_id: contactId,
    from_date: "",
    to_date: "",
    attributes: "all",
    sort: "date",
  })
  const hit = (data?.$items ?? []).find((i) => i.id && i.reference === reference && i.status?.displayed_as !== "Void")
  return hit ? invoiceRef(hit) : null
}

/**
 * Total and outstanding amount of Sage invoices, for "Update from Sage" (standing accounts). Reads each contact's sales
 * invoices page by page (the same getSalesInvoices call as above) from the earliest invoice date asked for.
 */
export async function getSageInvoiceAmounts(
  invoices: { sageInvoiceId: string; sageContactId?: string; invoiceDate: string }[],
): Promise<Map<string, { totalAmount: number; outstandingAmount: number }>> {
  const business = await getSageBusiness()
  const found = new Map<string, { totalAmount: number; outstandingAmount: number }>()
  const byContact = new Map<string, { ids: Set<string>; from: string }>()
  for (const inv of invoices) {
    if (!inv.sageContactId) continue
    const c = byContact.get(inv.sageContactId) ?? { ids: new Set<string>(), from: inv.invoiceDate }
    c.ids.add(inv.sageInvoiceId)
    if (inv.invoiceDate < c.from) c.from = inv.invoiceDate
    byContact.set(inv.sageContactId, c)
  }
  for (const [contactId, { ids, from }] of byContact) {
    for (let page = 1; page <= 20 && [...ids].some((id) => !found.has(id)); page++) {
      const data = await sagePost<{ $items?: (SageInvoiceData & { outstanding_amount?: number | string })[] }>(
        "getSalesInvoices",
        {
          business_id: business.id,
          items_per_page: 100,
          page,
          search: "",
          contact_id: contactId,
          from_date: from,
          to_date: "",
          attributes: "all",
          sort: "date",
        },
      )
      const items = data?.$items ?? []
      for (const i of items) {
        if (!i.id || !ids.has(i.id)) continue
        const total = Number(i.total_amount)
        const outstanding = Number(i.outstanding_amount)
        if (Number.isFinite(total) && Number.isFinite(outstanding))
          found.set(i.id, { totalAmount: total, outstandingAmount: outstanding })
      }
      if (items.length < 100) break
    }
  }
  return found
}

export async function createSageInvoice(input: SageInvoiceInput): Promise<SageInvoiceRef> {
  try {
    const data = await sagePost<SageInvoiceData>("createSalesInvoice", { ...input })
    if (!data?.id) throw new SageError("Sage did not return the new invoice's id")
    return invoiceRef(data)
  } catch (err) {
    if (err instanceof SageError && /Invoice Address is required/i.test(err.message)) {
      throw new SageError(
        "This client has no address in Sage One — add one in Sage (or in DocuSoft before linking) and try again",
      )
    }
    throw err
  }
}

/** Common Sage UK VAT rates. Check them against the Sage business once: ids can differ per region/plan. */
export const SAGE_TAX_RATES: { id: string; label: string }[] = [
  { id: "GB_STANDARD", label: "Standard (20%)" },
  { id: "GB_LOWER", label: "Reduced (5%)" },
  { id: "GB_ZERO", label: "Zero rated (0%)" },
  { id: "GB_EXEMPT", label: "Exempt" },
  { id: "GB_NO_TAX", label: "No VAT (outside the scope)" },
]
