import { useQuery } from "@tanstack/react-query"

import { getDocusoftCredentials } from "@/store/docusoftCreds"

// Stripe payments of one client, read through DocuSoft Practice's Stripe proxy (the same call as Practice's client
// card "Stripe" tab). The proxy looks up the agreement's Stripe keys itself from the DocuSoft login sent in the body —
// the Stripe secret never reaches the browser. The client's Stripe customer id is on its DocuSoft client card
// (Json_GetClientCardDetails → Table1[0].StripeCustomerId). Read-only: the proxy can't create payments yet.
const STRIPE_PROXY = "https://digitalpractice.net/stripeApis"
const URL_TYPE = "com" // DocuSoft's UK site (accountancy.mydocusoft.com) — Practice's BaseUrl.getUrlType()

export interface StripePayment {
  id: string
  amount?: number // minor units (pence)
  amount_received?: number
  currency?: string
  status?: string
  created?: number // unix seconds
  description?: string
  [key: string]: unknown
}

async function getStripePayments(customerId: string): Promise<StripePayment[]> {
  const creds = getDocusoftCredentials()
  if (!creds) throw new Error("Not connected to DocuSoft — please sign in again")
  const res = await fetch(`${STRIPE_PROXY}/getPaymentsByCustomer`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      customer_id: customerId,
      limit: 100,
      agrno: creds.agrno,
      Email: creds.Email,
      password: creds.password,
      UrlType: URL_TYPE,
    }),
  })
  const json = (await res.json().catch(() => null)) as { status?: boolean; data?: unknown; message?: string } | null
  if (!res.ok || !json?.status) throw new Error(json?.message || `Could not load Stripe payments (HTTP ${res.status})`)
  return Array.isArray(json.data) ? (json.data as StripePayment[]) : []
}

export function useStripePayments(customerId: string | undefined) {
  return useQuery({
    enabled: !!customerId,
    queryKey: ["stripe", "payments", customerId],
    queryFn: () => getStripePayments(customerId as string),
    staleTime: 60_000,
  })
}

// One Stripe payment by its id (payment intent "pi_…"), the same proxy call as Practice's client card. Used to check a
// card payment the customer made in the portal — the portal reports it, staff can see it in Stripe here.
async function getStripeTransaction(transactionId: string): Promise<StripePayment> {
  const creds = getDocusoftCredentials()
  if (!creds) throw new Error("Not connected to DocuSoft — please sign in again")
  const res = await fetch(`${STRIPE_PROXY}/getTransactionById`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      transaction_id: transactionId,
      agrno: creds.agrno,
      Email: creds.Email,
      password: creds.password,
      UrlType: URL_TYPE,
    }),
  })
  const json = (await res.json().catch(() => null)) as { status?: boolean; data?: unknown; message?: string } | null
  if (!res.ok || !json?.status || !json.data) {
    throw new Error(json?.message || `Could not load the Stripe payment (HTTP ${res.status})`)
  }
  return json.data as StripePayment
}

export function useStripeTransaction(transactionId: string | undefined) {
  return useQuery({
    enabled: !!transactionId,
    queryKey: ["stripe", "transaction", transactionId],
    queryFn: () => getStripeTransaction(transactionId as string),
    staleTime: 5 * 60_000,
    retry: false,
  })
}
