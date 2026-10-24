import { invoiceSendApi, type Invoice } from "@/api/invoices"
import {
  SageError,
  assertSageOneIsActive,
  createSageContact,
  createSageInvoice,
  findSageContactByReference,
  findSageInvoiceByReference,
  getLinkedSageContactId,
  getSageAccessToken,
  getSageBusiness,
  linkSageContact,
  type SageContactInput,
} from "@/api/sage"

export type SendStep = "accounting" | "contact" | "business" | "checking" | "creating" | "recording"

// Put in front of an error, so "This field is required: address line 1" also says where it happened.
const STEP_FAILED: Record<SendStep, string> = {
  accounting: "Checking the accounting system",
  contact: "Finding or creating the client in Sage One",
  business: "Reading the Sage business",
  checking: "Checking Sage for this invoice",
  creating: "Creating the invoice in Sage One",
  recording: "Saving the Sage invoice here",
}

export const SEND_STEP_LABEL: Record<SendStep, string> = {
  accounting: "Checking the practice's accounting system…",
  contact: "Finding the client in Sage…",
  business: "Reading the Sage business…",
  checking: "Checking it isn't already in Sage…",
  creating: "Creating the invoice in Sage…",
  recording: "Saving the Sage invoice here…",
}

interface SendOptions {
  invoice: Invoice
  projectId: number | undefined // the client's DocuSoft folder — needed to read / write its Sage link (CCode)
  ledgerAccountId: string // for lines without their own ledger account
  address?: SageContactInput["address"] // used only if a new Sage contact has to be created
  stripeCustomerId?: string // the client's Stripe customer (DocuSoft card) — an order's invoice can then be paid by card in the portal
  onStep?: (step: SendStep) => void
}

/**
 * Creates one WMS invoice in Sage exactly once:
 *   0. Sage One must be the practice's active accounting system, else nothing happens (SAGE_NOT_ACTIVE — the screen
 *      shows the admin / non-admin warning); then a usable Sage sign-in
 *   1. sending lock in our backend (a second tab, or a retry, can't run at the same time)
 *   2. Sage contact: the client's CCode (Json_GetSupplierListByProjectOrgNo) → else a Sage contact with the client id as
 *      reference → else a new one; a found/new contact is written back to DocuSoft (CCode) so Practice uses the same one
 *   3. look for a Sage invoice with our invoice number as reference first — a retry after "created in Sage, but the
 *      answer never reached us" finds it instead of creating a second one
 *   4. record the Sage id/link here ("issued"); on any failure the backend gets the reason and the invoice is a draft again
 * Returns the issued invoice, plus a warning when the DocuSoft link couldn't be saved (the invoice itself is fine).
 */
export async function sendInvoiceToSage({
  invoice,
  projectId,
  ledgerAccountId,
  address,
  stripeCustomerId,
  onStep,
}: SendOptions) {
  onStep?.("accounting")
  await assertSageOneIsActive() // not the active accounting system → stop before anything touches Sage
  await getSageAccessToken() // not connected → stop before taking the lock
  if (!projectId)
    throw new SageError("This client's DocuSoft folder isn't known — open it from the Clients list once and try again")
  const lines = invoice.lines ?? []
  if (lines.length === 0) throw new SageError("The invoice has no lines")
  if (lines.some((l) => !(l.ledgerAccountId || ledgerAccountId)))
    throw new SageError("Choose the Sage ledger account for the invoice lines")

  await invoiceSendApi.start(invoice.id)
  let warning: string | undefined
  let step: SendStep = "contact"
  const at = (s: SendStep) => {
    step = s
    onStep?.(s)
  }
  try {
    at("contact")
    let contactId = await getLinkedSageContactId(projectId, invoice.clientId)
    if (!contactId) {
      contactId = (await findSageContactByReference(invoice.clientId)) ?? ""
      if (!contactId) {
        // Sage can't create a client (and later invoice it) without an address — say so instead of Sage's bare
        // "This field is required".
        if (!address?.line1?.trim()) {
          throw new SageError(
            `${invoice.clientName} isn't in Sage One yet, and its DocuSoft client card has no address — Sage needs one ` +
              "(at least the first line and postcode). Add it to the client in DocuSoft, or create / link the client " +
              "in Sage One from Practice, then send again.",
          )
        }
        contactId = await createSageContact({ name: invoice.clientName, reference: invoice.clientId, address })
      }
      try {
        await linkSageContact(projectId, invoice.clientId, contactId)
      } catch {
        warning =
          "The invoice is in Sage, but the Sage contact couldn't be saved on the DocuSoft client — link it in Practice."
      }
    }

    at("business")
    const business = await getSageBusiness()

    at("checking")
    let sageInvoice = await findSageInvoiceByReference(business.id, contactId, invoice.invoiceNumber)
    if (!sageInvoice) {
      at("creating")
      sageInvoice = await createSageInvoice({
        business_id: business.id,
        contact_id: contactId,
        date: invoice.invoiceDate,
        due_date: invoice.dueDate,
        reference: invoice.invoiceNumber,
        notes: invoice.notes,
        invoice_lines: lines.map((l) => ({
          description: l.description || "N/A",
          ledger_account_id: l.ledgerAccountId || ledgerAccountId,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          tax_rate_id: l.taxRateId,
        })),
      })
    }

    at("recording")
    const issued = await invoiceSendApi.issued(invoice.id, {
      sageInvoiceId: sageInvoice.id,
      sageInvoiceNumber: sageInvoice.invoiceNumber,
      sageLink: sageInvoice.link,
      sageContactId: contactId,
      sageBusinessId: business.id,
      grossTotal: sageInvoice.totalAmount, // what the customer pays for an order's invoice
      currency: sageInvoice.currency,
      stripeCustomerId,
    })
    return { invoice: issued, warning }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    const message = `${STEP_FAILED[step]}: ${reason}`
    await invoiceSendApi.failed(invoice.id, message).catch(() => undefined)
    throw err instanceof SageError ? new SageError(message, err.code) : new Error(message)
  }
}
