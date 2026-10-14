"use client"

import { useMemo } from "react"

import {
  useGetAllClientsQuery,
  useGetClientAddressesQuery,
  useGetClientCardQuery,
  useGetClientContactsQuery,
  type DocusoftAddress,
  type DocusoftContact,
} from "@/store/docusoftApi"
import { useAppSelector } from "@/store/hooks"

function mergeAddress(a: DocusoftAddress | undefined): string {
  if (!a) return ""
  return [a.Add1, a.Add2, a.Add3, a.Town, a.County, a.Country, a.Postcode].filter(Boolean).join(", ")
}

/**
 * Everything DocuSoft knows about the client the user opened: name, address and contacts. The card and the
 * addresses are fetched once per client (RTK Query cache, kept in the Redux store) — DocuSoft scopes the card
 * to a folder, so this needs the folder picked on the Clients screen.
 */
export function useClientCard(clientId: string) {
  const folderId = useAppSelector((state) => state.clientsUi.folderId)
  const selectedClient = useAppSelector((state) => state.clientsUi.selectedClient)
  const projectId = folderId ? Number(folderId) : undefined

  const card = useGetClientCardQuery({ projectId: projectId ?? 0, clientId }, { skip: projectId === undefined })
  const addresses = useGetClientAddressesQuery(clientId)

  // Fallback name (no folder, e.g. direct URL): the picked client, else the cached practice-wide client list.
  const selectedIsThis = selectedClient?.ClientID === clientId
  const { data: allClients } = useGetAllClientsQuery(undefined, { skip: selectedIsThis || !!card.data })

  return useMemo(() => {
    const record = card.data?.Table1?.[0]
    const sorted = [...(addresses.data ?? [])].sort((a, b) => Number(a.AddressId) - Number(b.AddressId))
    const main = sorted.find((a) => a.AddressType === "Main Address") ?? sorted[0]
    const contacts: DocusoftContact[] = card.data?.Table6 ?? []
    const name =
      record?.OriginatorName ||
      (selectedIsThis ? selectedClient?.Client : allClients?.find((c) => c.ClientId === clientId)?.Client)

    return {
      name,
      address: mergeAddress(main),
      record,
      contacts,
      needsFolder: projectId === undefined,
      isLoading: card.isLoading || addresses.isLoading,
      isError: card.isError,
      addressError: addresses.isError,
    }
  }, [card, addresses, allClients, selectedClient, selectedIsThis, clientId, projectId])
}

export interface ClientContactOption {
  /** DocuSoft ContactNo */
  id: string
  name: string
  email: string
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim())

/**
 * The contacts of ANY client, for a "which contact is this for?" picker. Fetched from DocuSoft once per client
 * (RTK Query cache) — the folder is not needed from the caller (if the client was opened from the Clients list its
 * folder is used first).
 */
export function useClientContacts(clientId: string, clientProjectId?: number) {
  const folderId = useAppSelector((state) => state.clientsUi.folderId)
  const selectedClient = useAppSelector((state) => state.clientsUi.selectedClient)
  // The client object's own project id first; else the folder the client was opened from on the Clients screen.
  const projectId =
    clientProjectId ?? (folderId && selectedClient?.ClientID === clientId ? Number(folderId) : undefined)

  const query = useGetClientContactsQuery({ clientId, projectId }, { skip: !clientId })

  return useMemo(() => {
    const contacts: ClientContactOption[] = (query.data ?? []).map((c, i) => ({
      id: str(c["ContactNo"]) || String(i),
      name: [str(c["First Name"]), str(c["Last Name"])].filter(Boolean).join(" ") || "Unnamed contact",
      email: str(c["E-Mail"]),
    }))
    return { contacts, isLoading: !!clientId && query.isLoading, isError: query.isError }
  }, [query.data, query.isError, query.isLoading, clientId])
}
