import { beforeEach, describe, expect, it, vi } from "vitest"

// DocuSoft calls are faked: Sage app credentials, the client's CCode, and the CCode write-back.
const docusoft = vi.hoisted(() => ({ calls: [] as { method: string; params?: Record<string, unknown> }[], ccode: "" }))
vi.mock("@/store/docusoftApi", () => ({
  callDocusoft: async (method: string, params?: Record<string, unknown>) => {
    docusoft.calls.push({ method, params })
    if (method === "Json_GetSageCredentials")
      return { Table: [{ SageClientId: "app-id", SageClientSecret: "app-secret" }] }
    if (method === "Json_GetSupplierListByProjectOrgNo") return JSON.stringify({ Table: [{ CCode: docusoft.ccode }] })
    return "Success"
  },
}))

// The backend's invoice hand-over endpoints are faked too.
const backend = vi.hoisted(() => ({ calls: [] as string[] }))
vi.mock("@/api/invoices", () => ({
  invoiceSendApi: {
    start: async (id: string) => (backend.calls.push(`start:${id}`), { id }),
    issued: async (id: string, body: { sageInvoiceId: string }) => (
      backend.calls.push(`issued:${id}:${body.sageInvoiceId}`),
      { id, status: "issued", ...body }
    ),
    failed: async (id: string, message: string) => (backend.calls.push(`failed:${id}:${message}`), { id }),
  },
}))

import { NOT_CONNECTED, SageError, clearSageTokens, getSageAccessToken, hasSageSession } from "@/api/sage"
import { sendInvoiceToSage } from "@/staff/features/billing/send-to-sage"
import type { Invoice } from "@/api/invoices"

type ProxyHandler = (body: Record<string, unknown>) => unknown
let proxy: Record<string, ProxyHandler>
let proxyCalls: { api: string; body: Record<string, unknown> }[]

beforeEach(() => {
  localStorage.clear()
  clearSageTokens()
  docusoft.calls = []
  docusoft.ccode = ""
  backend.calls = []
  proxyCalls = []
  proxy = {}
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    const api = url.replace("https://digitalpractice.net/sageone/", "")
    const body = JSON.parse(init.body)
    proxyCalls.push({ api, body })
    const handler = proxy[api]
    if (!handler) throw new Error(`unexpected proxy call ${api}`)
    return { ok: true, status: 200, json: async () => handler(body) }
  })
})

function signIn({ accessValid = true } = {}) {
  const now = Date.now()
  localStorage.setItem("wms_sage_access_token", "access-1")
  localStorage.setItem("wms_sage_access_token_expiry", String(now + (accessValid ? 3600_000 : -1)))
  localStorage.setItem("wms_sage_refresh_token", "refresh-1")
  localStorage.setItem("wms_sage_refresh_token_expiry", String(now + 86_400_000))
}

describe("Sage token", () => {
  it("is 'not connected' without a sign-in, and never opens a popup on its own", async () => {
    expect(hasSageSession()).toBe(false)
    await expect(getSageAccessToken()).rejects.toMatchObject({ code: NOT_CONNECTED })
  })

  it("uses a valid access token as is", async () => {
    signIn()
    expect(await getSageAccessToken()).toBe("access-1")
    expect(proxyCalls).toHaveLength(0)
  })

  it("refreshes an expired access token with the app key from DocuSoft, once for parallel callers", async () => {
    signIn({ accessValid: false })
    proxy.refreshSageAccessToken = (b) => ({
      status: true,
      data: { access_token: `access-2-${b.refresh_token}`, refresh_token: "refresh-2", expires_in: 3600 },
    })
    const [a, b] = await Promise.all([getSageAccessToken(), getSageAccessToken()])
    expect(a).toBe("access-2-refresh-1")
    expect(b).toBe(a)
    expect(proxyCalls.filter((c) => c.api === "refreshSageAccessToken")).toHaveLength(1)
    expect(proxyCalls[0].body).toMatchObject({ client_id: "app-id", client_secret: "app-secret" })
    expect(localStorage.getItem("wms_sage_refresh_token")).toBe("refresh-2")
  })

  it("forgets a refresh token Sage rejects and says 'connect again' instead of failing silently", async () => {
    signIn({ accessValid: false })
    proxy.refreshSageAccessToken = () => ({ status: false, error: [{ $message: "invalid_grant", $dataCode: "x" }] })
    await expect(getSageAccessToken()).rejects.toMatchObject({ code: NOT_CONNECTED })
    expect(hasSageSession()).toBe(false)
  })
})

const invoice: Invoice = {
  id: "inv-1",
  invoiceNumber: "WMS-INV-000007",
  clientId: "ORG-9",
  clientName: "Acme Ltd",
  invoiceDate: "2026-11-01",
  dueDate: "2026-11-15",
  status: "draft",
  netTotal: 10,
  createdBy: { id: "u", name: "U", side: "staff" },
  createdAt: "2026-11-01T00:00:00.000Z",
  lines: [{ kind: "storage", description: "Storage", quantity: 2, unitPrice: 5, taxRateId: "GB_STANDARD" }],
}
const send = () => sendInvoiceToSage({ invoice, projectId: 12, ledgerAccountId: "L-1", address: { city: "Leeds" } })

describe("sending an invoice to Sage", () => {
  beforeEach(() => {
    signIn()
    proxy.getBusinesses = () => ({ status: true, data: { $items: [{ id: "B-1", name: "Warehouse Ltd" }] } })
    proxy.getSalesInvoices = () => ({ status: true, data: { $items: [] } })
    proxy.createSalesInvoice = () => ({
      status: true,
      data: { id: "S-1", invoice_number: "SI-1", links: [{ rel: "alternate", href: "https://sage/S-1" }] },
    })
  })

  it("uses the client's linked contact (CCode) and creates the invoice with our number as reference", async () => {
    docusoft.ccode = "C-LINKED"
    const { invoice: issued } = await send()
    const create = proxyCalls.find((c) => c.api === "createSalesInvoice")!.body
    expect(create).toMatchObject({
      access_token: "access-1",
      business_id: "B-1",
      contact_id: "C-LINKED",
      reference: "WMS-INV-000007",
      date: "2026-11-01",
      due_date: "2026-11-15",
      invoice_lines: [{ ledger_account_id: "L-1", quantity: 2, unit_price: 5, tax_rate_id: "GB_STANDARD" }],
    })
    expect(backend.calls).toEqual(["start:inv-1", "issued:inv-1:S-1"])
    expect(issued).toMatchObject({ sageInvoiceNumber: "SI-1", sageLink: "https://sage/S-1" })
    expect(proxyCalls.some((c) => c.api === "createContact")).toBe(false)
  })

  it("never creates a second Sage invoice: an existing one with our reference is used instead", async () => {
    docusoft.ccode = "C-LINKED"
    proxy.getSalesInvoices = () => ({
      status: true,
      data: { $items: [{ id: "S-OLD", reference: "WMS-INV-000007", status: { displayed_as: "Unpaid" }, links: [] }] },
    })
    await send()
    expect(proxyCalls.some((c) => c.api === "createSalesInvoice")).toBe(false)
    expect(backend.calls).toEqual(["start:inv-1", "issued:inv-1:S-OLD"])
  })

  it("ignores a voided Sage invoice with the same reference", async () => {
    docusoft.ccode = "C-LINKED"
    proxy.getSalesInvoices = () => ({
      status: true,
      data: { $items: [{ id: "S-VOID", reference: "WMS-INV-000007", status: { displayed_as: "Void" } }] },
    })
    await send()
    expect(backend.calls).toEqual(["start:inv-1", "issued:inv-1:S-1"])
  })

  it("unlinked client: reuses a Sage contact with the client id as reference and links it in DocuSoft", async () => {
    proxy.getContacts = () => ({ status: true, data: { contacts: [{ id: "C-FOUND", reference: "ORG-9" }] } })
    await send()
    expect(proxyCalls.some((c) => c.api === "createContact")).toBe(false)
    expect(docusoft.calls.find((c) => c.method === "Json_UpdateClientField")?.params).toEqual({
      projectid: 12,
      ClientId: "ORG-9",
      fieldName: "CCode",
      fieldValue: "C-FOUND",
    })
  })

  it("unlinked client with no Sage contact: creates one with the real town (not 'Liverpool'), then links it", async () => {
    proxy.getContacts = () => ({ status: true, data: { contacts: [] } })
    proxy.createContact = () => ({ status: true, data: { id: "C-NEW" } })
    await send()
    const contact = proxyCalls.find((c) => c.api === "createContact")!.body.contact as Record<string, unknown>
    expect(contact).toMatchObject({ name: "Acme Ltd", reference: "ORG-9", contact_type_ids: ["CUSTOMER"] })
    expect((contact.main_address as Record<string, unknown>).city).toBe("Leeds")
    expect(proxyCalls.find((c) => c.api === "createSalesInvoice")!.body.contact_id).toBe("C-NEW")
  })

  it("a Sage error goes back to the backend as the reason and reaches the user", async () => {
    docusoft.ccode = "C-LINKED"
    proxy.createSalesInvoice = () => ({ status: false, error: [{ $message: "Invoice Address is required" }] })
    await expect(send()).rejects.toThrow(/no address in Sage One/)
    expect(backend.calls[0]).toBe("start:inv-1")
    expect(backend.calls[1]).toMatch(/^failed:inv-1:This client has no address in Sage One/)
  })

  it("an expired access token mid-call is refreshed once and the call retried", async () => {
    docusoft.ccode = "C-LINKED"
    let first = true
    proxy.getBusinesses = (b) => {
      if (first) {
        first = false
        return { status: false, error: [{ $message: "expired", $dataCode: "AccessTokenExpiredError" }] }
      }
      return { status: true, data: { $items: [{ id: `B-${b.access_token}` }] } }
    }
    proxy.refreshSageAccessToken = () => ({ status: true, data: { access_token: "access-2", expires_in: 3600 } })
    await send()
    expect(proxyCalls.find((c) => c.api === "createSalesInvoice")!.body.business_id).toBe("B-access-2")
  })

  it("not connected: stops before taking the sending lock", async () => {
    clearSageTokens()
    await expect(send()).rejects.toBeInstanceOf(SageError)
    expect(backend.calls).toEqual([])
  })
})
