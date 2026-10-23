import { createApi } from "@reduxjs/toolkit/query/react"
import type { BaseQueryFn } from "@reduxjs/toolkit/query"

import { DOCUSOFT_BASE_URL } from "@/store/docusoftConfig"
import { getDocusoftCredentials } from "@/store/docusoftCreds"

// RTK Query slice for DocuSoft's own .asmx API — called DIRECTLY from the browser, not through
// our backend (see README/CLAUDE.md "Clients/Folders are NOT proxied through this backend").
// This is the one place in the app that uses Redux/RTK Query instead of TanStack Query: the user
// explicitly wants this reference data (folders, clients) fetched once and reused everywhere
// without every screen re-requesting it — RTK Query's automatic per-endpoint cache (same
// endpoint+args = one shared cache entry across every component) does exactly that, whereas
// TanStack Query (used for everything else in this app) would need per-hook staleTime tuning to
// get the same effect. Reference implementation for the request/response shape: C:\Aakash Singh\
// projects\docusoftpractice (js_class/API_Class.js, AllService.js, CommanCLS.js).

interface DocusoftRequest {
  method: string // DocuSoft method name, e.g. "Json_GetFolders"
  params?: Record<string, unknown> // extra fields merged in alongside {agrno, Email, password}
}

interface DocusoftApiError {
  status?: number
  message: string
}

// Custom baseQuery (not fetchBaseQuery) because every call needs the stored creds merged into
// the body, and DocuSoft's ".asmx" response convention ({d: "<json string>"}) needs unwrapping.
const docusoftBaseQuery: BaseQueryFn<DocusoftRequest, unknown, DocusoftApiError> = async ({ method, params }) => {
  const creds = getDocusoftCredentials()
  if (!creds)
    return {
      error: { message: "Not connected to DocuSoft — please sign in again" },
    }

  try {
    const res = await fetch(`${DOCUSOFT_BASE_URL}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ...creds, ...params }),
    })
    if (!res.ok) {
      return {
        error: {
          status: res.status,
          message: `DocuSoft API error: ${res.status} ${res.statusText}`,
        },
      }
    }
    const wrapper = (await res.json()) as { d?: string }
    const data = wrapper.d ? JSON.parse(wrapper.d) : {}
    return { data }
  } catch (err) {
    return {
      error: {
        message: err instanceof Error ? err.message : "Network error calling DocuSoft",
      },
    }
  }
}

export interface DocusoftFolder {
  FolderID: number
  Folder: string
}

export interface DocusoftClient {
  ClientID: string
  Client: string
  Email?: string
  strconf?: string
  /** Added by us: the folder (DocuSoft "project") this client was listed under. */
  ProjectId?: number
  [key: string]: unknown
}

/**
 * A client from the practice-wide list, merged with EVERYTHING DocuSoft says about it in its folder
 * (Email, strconf, ProjectId, … — whatever the folder list carries). Pickers keep this whole object, so any
 * field is available later without another request.
 */
export type DocusoftClientDetails = DocusoftClientListItem & Partial<Omit<DocusoftClient, "ClientID" | "Client">>

// Note the field is `ClientId` (lowercase "d") here, unlike DocusoftClient's `ClientID` above —
// that's DocuSoft's own inconsistent casing across these two endpoints, not a typo.
export interface DocusoftClientListItem {
  ClientId: string
  Client: string
  [key: string]: unknown // DocuSoft also sends the client's project (folder) id here — read it with projectIdOf()
}

/** The project (folder) id carried by a DocuSoft client object, whatever the casing of its key ("ProjectId", "ProjectID", …). */
export function projectIdOf(client: object | null | undefined): number | undefined {
  if (!client) return undefined
  const key = Object.keys(client).find((k) => k.toLowerCase() === "projectid")
  const n = key ? Number((client as Record<string, unknown>)[key]) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

// Json_GetClientCardDetails returns several tables. Per the reference project (docusoftpractice/main_js/
// client_card_details.js): Table1[0] = the client's own record, Table6 = its contacts. The whole response
// is kept in the store as-is; the pages pick what they need.
export interface DocusoftClientRecord {
  OriginatorNo?: string
  OriginatorName?: string
  Email?: string
  TelNo?: string
  CompanyNo?: string
  [key: string]: unknown
}
export type DocusoftContact = Record<string, unknown> // "First Name", "Last Name", "E-Mail", "ContactNo", "Main Contact", "Portal User", ...
export interface DocusoftClientCard {
  Table1?: DocusoftClientRecord[]
  Table6?: DocusoftContact[]
  [table: string]: unknown
}

// Json_GetClientAddresses -> Table rows (the card API itself carries no address).
export interface DocusoftAddress {
  AddressId?: string | number
  AddressType?: string
  Add1?: string
  Add2?: string
  Add3?: string
  Town?: string
  County?: string
  Country?: string
  Postcode?: string
}

// Some DocuSoft methods double-encode (the `d` string holds a JSON *string* of the JSON).
function parseMaybeString<T>(response: unknown): T {
  return (typeof response === "string" ? JSON.parse(response) : (response ?? {})) as T
}

export const docusoftApi = createApi({
  reducerPath: "docusoftApi",
  baseQuery: docusoftBaseQuery,
  // Default is 60s after the last subscriber unmounts — i.e. leaving Clients for a minute would
  // drop the cache and re-fetch on return. Folders/clients rarely change, so keep them for the
  // whole session (a day); logout wipes everything (see useAuth.tsx -> resetApiState).
  keepUnusedDataFor: 60 * 60 * 24,
  endpoints: (builder) => ({
    getFolders: builder.query<DocusoftFolder[], void>({
      query: () => ({ method: "Json_GetFolders" }),
      transformResponse: (response: { Table?: DocusoftFolder[] }) => response.Table ?? [],
    }),
    // Practice-wide client list (no folder filter) — used by generic "pick any client" pickers
    // (register box, create order, audit log filter) where a folder isn't known yet.
    getAllClients: builder.query<DocusoftClientListItem[], void>({
      query: () => ({ method: "Json_GetAllClientList" }),
      transformResponse: (response: { Table?: DocusoftClientListItem[] }) => response.Table ?? [],
    }),
    // Fired when a client is selected (folder id + client id) and cached for the session — see clientsUiSlice.
    getClientCard: builder.query<DocusoftClientCard, { projectId: number; clientId: string }>({
      query: ({ projectId, clientId }) => ({
        method: "Json_GetClientCardDetails",
        params: { intProjectId: projectId, strOrignatorNumber: clientId },
      }),
      transformResponse: (response: unknown) => parseMaybeString<DocusoftClientCard>(response),
    }),
    // Contacts of a client: Json_GetAllContactsByClientID needs the client's ProjectID (taken from the client object).
    // Only if that is unknown does it try "" and 0 (the reference project passes "" when it has none).
    getClientContacts: builder.query<DocusoftContact[], { clientId: string; projectId?: number }>({
      async queryFn({ clientId, projectId }, _api, _extra, baseQuery) {
        const attempts: (number | string)[] = projectId ? [projectId] : ["", 0]
        let lastError: unknown
        for (const id of attempts) {
          const res = await baseQuery({
            method: "Json_GetAllContactsByClientID",
            params: { ProjectID: id, ClientID: clientId },
          })
          if (res.error) {
            lastError = res.error
            continue
          }
          const rows = parseMaybeString<{ Table?: DocusoftContact[] }>(res.data).Table ?? []
          if (rows.length > 0) return { data: rows }
        }
        return lastError ? { error: lastError as DocusoftApiError } : { data: [] }
      },
    }),
    getClientAddresses: builder.query<DocusoftAddress[], string>({
      query: (clientId) => ({ method: "Json_GetClientAddresses", params: { clientId } }),
      transformResponse: (response: unknown) => parseMaybeString<{ Table?: DocusoftAddress[] }>(response).Table ?? [],
    }),
    getFolderClients: builder.query<DocusoftClient[], number>({
      query: (projectId) => ({
        method: "Json_GetClientsByFolder",
        params: { ProjectId: projectId },
      }),
      // Every client carries the folder it was listed under as `ProjectId`.
      transformResponse: (response: { Table1?: DocusoftClient[] }, _meta, projectId) =>
        (response.Table1 ?? []).map((c) => ({ ...c, ProjectId: projectId })),
    }),
    // The practice-wide client list enriched with each client's folder data. Json_GetAllClientList only has name+id,
    // so: list every folder's clients once (one call per folder, then cached for the session) and merge by client id.
    getClientsWithDetails: builder.query<DocusoftClientDetails[], void>({
      async queryFn(_arg, _api, _extra, baseQuery) {
        const all = await baseQuery({ method: "Json_GetAllClientList" })
        if (all.error) return { error: all.error as DocusoftApiError }
        const list = parseMaybeString<{ Table?: DocusoftClientListItem[] }>(all.data).Table ?? []

        const foldersRes = await baseQuery({ method: "Json_GetFolders" })
        const folders = foldersRes.error
          ? []
          : (parseMaybeString<{ Table?: DocusoftFolder[] }>(foldersRes.data).Table ?? [])

        const byId = new Map<string, DocusoftClient>()
        await Promise.all(
          folders.map(async (folder) => {
            const res = await baseQuery({ method: "Json_GetClientsByFolder", params: { ProjectId: folder.FolderID } })
            if (res.error) return
            for (const c of parseMaybeString<{ Table1?: DocusoftClient[] }>(res.data).Table1 ?? []) {
              if (!byId.has(c.ClientID)) byId.set(c.ClientID, { ...c, ProjectId: folder.FolderID })
            }
          }),
        )

        return {
          // The folder's own fields first, then the list's ClientId/Client on top (the list is the source of truth for those).
          data: list.map((c) => ({ ...byId.get(c.ClientId), ...c })),
        }
      },
    }),
  }),
})

export const {
  useGetFoldersQuery,
  useGetAllClientsQuery,
  useGetClientsWithDetailsQuery,
  useGetFolderClientsQuery,
  useGetClientCardQuery,
  useGetClientAddressesQuery,
  useGetClientContactsQuery,
} = docusoftApi
