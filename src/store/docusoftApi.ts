import { createApi } from "@reduxjs/toolkit/query/react"
import type { BaseQueryFn } from "@reduxjs/toolkit/query"

import { DOCUSOFT_BASE_URL, DOCUSOFT_PORTAL_URL } from "@/store/docusoftConfig"
import { getDocusoftCredentials, getStoredProjectId } from "@/store/docusoftCreds"
import { noteToText, textToNote } from "@/lib/docusoftNotes"

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
  /** The key the login email goes under, for the few methods that don't call it "Email" (e.g. "email"). */
  emailKey?: string
}

interface DocusoftApiError {
  status?: number
  message: string
}

export class DocusoftError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = "DocusoftError"
    this.status = status
  }
}

/**
 * One DocuSoft .asmx call with the stored creds merged into the body. Returns the unwrapped `d` — parsed JSON, or the
 * plain string when DocuSoft answers with text (e.g. "Success"). Throws DocusoftError. For one-off calls outside RTK
 * Query (the Sage integration's credential / client-field calls); cached reference data goes through docusoftApi below.
 */
export async function callDocusoft(
  method: string,
  params?: Record<string, unknown>,
  options?: { emailKey?: string },
): Promise<unknown> {
  const creds = getDocusoftCredentials()
  if (!creds) throw new DocusoftError("Not connected to DocuSoft — please sign in again")
  // the login email under the method's own key name when it differs from "Email"
  const { Email, ...rest } = creds
  const credentials = options?.emailKey ? { ...rest, [options.emailKey]: Email } : creds
  try {
    const res = await fetch(`${DOCUSOFT_BASE_URL}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ...credentials, ...params }),
    })
    if (!res.ok) throw new DocusoftError(`DocuSoft API error: ${res.status} ${res.statusText}`, res.status)
    const wrapper = (await res.json()) as { d?: string }
    if (!wrapper.d) return {}
    try {
      return JSON.parse(wrapper.d)
    } catch {
      return wrapper.d
    }
  } catch (err) {
    if (err instanceof DocusoftError) throw err
    throw new DocusoftError(err instanceof Error ? err.message : "Network error calling DocuSoft")
  }
}

// Custom baseQuery (not fetchBaseQuery) because every call needs the stored creds merged into
// the body, and DocuSoft's ".asmx" response convention ({d: "<json string>"}) needs unwrapping.
const docusoftBaseQuery: BaseQueryFn<DocusoftRequest, unknown, DocusoftApiError> = async ({
  method,
  params,
  emailKey,
}) => {
  try {
    return { data: await callDocusoft(method, params, { emailKey }) }
  } catch (err) {
    return {
      error: {
        status: err instanceof DocusoftError ? err.status : undefined,
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

// One document row of Json_GetAllSearchItemsByBoxNumber's Table6 (only the fields we show are typed).
export interface DocusoftBoxDocument {
  "Registration No.": number
  BoxNumber?: string
  Section?: string | null
  SubSection?: string | null
  "Received Date"?: string | null
  "Item Date"?: string | null
  Description?: string | null
  FileSize?: string | null
  Category?: string | null
  Type?: string | null
  DocDirection?: string | null
  [key: string]: unknown
}

export interface DocusoftSection {
  SecID: number
  Sec: string
}

// "DMS Reference UDFs": DocuSoft's own fields of one client (Reference = OriginatorNo) in one folder (ProjectId).
// They live only in DocuSoft — never in our database. Reference: docusoftpractice main_js/settings.js (DMS Reference UDF tab).
// Flags come back as "Yes" / "No"; ids may come as numbers or strings, so compare them with String().
export interface DocusoftReferenceUdf {
  UserDefFieldID: number | string
  Name: string
  TooltipText?: string | null
  UserDefFieldTypeID: number | string // 1 = Text, 2 = Combo (list of options)
  TextControlValue?: string | null // format of a Text field: "String" | "Integer" | "Date"
  Mandatory?: string | null
  CanUpdate?: string | null
  UDFHide?: string | null
  OriginatorNo?: string
  [key: string]: unknown
}

export interface DocusoftReferenceUdfOption {
  ListID: number | string
  Value: string
  UserDefFieldID: number | string
  [key: string]: unknown
}

/** What the add / update form sends (the endpoints map it to DocuSoft's own — differently spelled — keys). */
export interface ReferenceUdfInput {
  clientId: string
  projectId: number
  name: string
  tooltip: string
  typeId: "1" | "2"
  format: string // "" for a Combo field
  mandatory: boolean
  updatable: boolean
  hidden: boolean
}

// Json_GetConfiguration: the Company Details dropdowns of DocuSoft's Add Client page (docusoftpractice add_client.js
// Configurationbusiness): Table = Status, Table1 = Business, Table2 = Source, Table3 = users (the Manager).
export interface DocusoftConfiguration {
  statuses: { StatusId: number | string; StatusName: string }[]
  businesses: { BussId: number | string; BussName: string }[]
  sources: { SourceId: number | string; SourceName: string }[]
  users: { UserId: number | string; UserName: string }[]
}

/** What the Add client form sends; Json_AddClient's own (DocuSoft-spelled) keys are set in the endpoint. */
export interface NewClientInput {
  clientId: string // OriginatorNo — the client's reference
  name: string
  folderIds: number[] // the folders (projects) the client goes in
  email: string
  tel: string
  altTel: string
  address: string // the full address as one block of text
  statusId: string
  businessId: string
  sourceId: string
  managerId: string // a user id — required by DocuSoft
  description: string
  active: "Yes" | "No" | "HID" // active / inactive / hidden
}

// --- Contact UDFs (Settings → Contact UDF) — DocuSoft's own fields of a folder's contacts. Reference: docusoftpractice
// main_js/ContactUdf.js. Json_GetUDFDetails (UDFType 2) answers Table = tags, Table1 = fields, Table2 = drop-down options.
export interface DocusoftUdfTag {
  TagID: number | string
  TagName: string
  [key: string]: unknown
}
export interface DocusoftContactUdf {
  UserDefFieldID: number | string
  Name: string
  TooltipText?: string | null
  UserDefFieldTypeID: number | string // 1 Text, 2 DropDownList, 10 Boolean, 15 UserList, 9 Formula
  TextControlValue?: string | null // format of a Text field: String / Integer / Date / Memo
  Tag?: number | string | null
  TextValue?: string | null // a Formula field's formula
  blnForClientView?: boolean | null
  blnForClientEdit?: boolean | null
  [key: string]: unknown
}
export interface DocusoftContactUdfOption {
  ListID: number | string
  Value: string
  UserDefFieldID: number | string
  [key: string]: unknown
}
export interface DocusoftContactUdfs {
  tags: DocusoftUdfTag[]
  fields: DocusoftContactUdf[]
  options: DocusoftContactUdfOption[]
}
/** One line of DocuSoft's activity log of a client (Json_GetActivityByClientId), tidied for display. */
export interface DocusoftActivity {
  key: string
  at: string // ISO date-time ("" when DocuSoft gave none)
  user: string
  note: string // may hold HTML — show it as text
  status: string
}

/** A client's named note (Json_Get_All_DS_Notes → Table). */
export interface DocusoftNote {
  NoteId: number | string
  NoteName: string
  NoteColor?: string | null
  [key: string]: unknown
}
/** The id used for the client's sticky "General" note (it has no NoteId in DocuSoft). */
export const GENERAL_NOTE = "general"

/** One contact's UDFs with their values (Json_GetCRMContactUDFValues). */
export interface DocusoftContactUdfValue {
  UserDefFieldID: number | string
  Name: string
  UserDefFieldTypeID: number | string // 1 Text, 2 DropDownList, 10 Boolean, 15 UserList, 9 Formula
  TextControlValue?: string | null // Text: String / Integer / Decimal / Date / Memo
  UdfValue?: string | null
  TagName?: string | null
  Options?: string | null // drop-down options, "a@;b@;c"
  [key: string]: unknown
}
export interface DocusoftContactUdfValues {
  tags: { TagName?: string; [key: string]: unknown }[]
  fields: DocusoftContactUdfValue[]
}

/** What the Contact UDF form sends (Add / Update map it to DocuSoft's keys). */
export interface ContactUdfInput {
  projectId: number
  name: string
  tooltip: string
  typeId: string
  format: string // Text: the format; Formula: "Integer"; others: "0" (as DocuSoft's page sends)
  tag: string
  formula: string
  forClientView: boolean
  forClientEdit: boolean
}

/** What the Edit client form sends (Json_UpdateClient). */
export interface UpdateClientInput {
  clientId: string // OriginatorNo — not changed here
  name: string
  address: string
  tel: string
  altTel: string
  statusId: string
  businessId: string
  sourceId: string
  managerId: string
  description: string
  orgPassword: string // kept as it was — this form doesn't show it
  active: "Yes" | "No" | "HID"
  cCode: unknown // exactly as Json_GetClientCardDetails returned it
}

/** One of a client's three addresses (Json_SetClientAddress): 1 = Main, 2 = Billing, 3 = Registered. */
export interface ClientAddressInput {
  clientId: string
  addressId: 1 | 2 | 3
  add1: string
  add2: string
  add3: string
  town: string
  county: string
  postcode: string
  country: string
}

/** The settings of a new portal user (DocuSoft's Create Portal form — onboard.js createportalArr, in its order). */
export interface PortalUserOptions {
  PresetMemorableData: boolean
  IssueReminders: boolean
  ExcludeMessageLink: boolean
  KeepSignedIn: boolean
  AllowUpload: boolean
  ChangeProfile: boolean
  LoggedIn: boolean
  Blocked: boolean
}
/** Only "Preset Memorable Data" on — as the Create Portal form starts, and what Add contact sends. */
export const DEFAULT_PORTAL_OPTIONS: PortalUserOptions = {
  PresetMemorableData: true,
  IssueReminders: false,
  ExcludeMessageLink: false,
  KeepSignedIn: false,
  AllowUpload: false,
  ChangeProfile: false,
  LoggedIn: false,
  Blocked: false,
}

/** What the Add contact form sends (Json_InsertContact). */
export interface NewContactInput {
  clientId: string // the client's reference (CCode)
  salutation: string
  firstName: string
  lastName: string
  greeting: string
  email: string
  tel: string
  mobile: string
  add1: string
  add2: string
  add3: string
  town: string
  postcode: string
  country: string
  role: string
  managerId: string // "" = none
  managerName: string
  note: string
  active: boolean
  mainContact: boolean
}

// Spelt exactly as DocuSoft's own page sends them (add_client.js mainAddress / billingAddress / registeredAddress).
const ADDRESS_TYPE = { 1: "Main Address", 2: "Billing Address", 3: "Registered Address" } as const

const yesNo = (value: boolean) => (value ? "Yes" : "No")

// DocuSoft write methods answer "Success" (or {"Status":"Success"}); anything else is the reason it failed.
function successOrError(
  data: unknown,
  fallback = "DocuSoft did not save it — please try again",
): { data: true } | { error: DocusoftApiError } {
  const status = typeof data === "object" && data !== null ? (data as { Status?: unknown }).Status : data
  if (typeof status === "string" && status.trim().toLowerCase() === "success") return { data: true }
  // DocuSoft's own reply when it gave one (e.g. an error text); otherwise the caller's explanation
  const reply = typeof status === "string" ? status.trim() : ""
  return {
    error: {
      message: reply && reply.toLowerCase() !== "fail" && reply.toLowerCase() !== "failed" ? reply : fallback,
    },
  }
}

// For DocuSoft writes whose success reply isn't a fixed "Success" (the list-value methods of contact UDFs — DocuSoft's own
// page accepts any reply): fail only on an error / "failed" / "exists" reply.
function unlessFailed(data: unknown, fallback: string): { data: true } | { error: DocusoftApiError } {
  const text =
    typeof data === "string"
      ? data.trim()
      : typeof data === "object" && data !== null
        ? String((data as { Status?: unknown }).Status ?? "")
        : ""
  if (/fail|error|exist|invalid/i.test(text)) return { error: { message: text || fallback } }
  return { data: true }
}

// Some DocuSoft methods double-encode (the `d` string holds a JSON *string* of the JSON).
function parseMaybeString<T>(response: unknown): T {
  return (typeof response === "string" ? JSON.parse(response) : (response ?? {})) as T
}

export const docusoftApi = createApi({
  reducerPath: "docusoftApi",
  baseQuery: docusoftBaseQuery,
  tagTypes: [
    "BoxDocs",
    "ReferenceUdfs",
    "ReferenceUdfOptions",
    "Clients",
    "Contacts",
    "ClientCard",
    "ClientAddresses",
    "ContactUdfs",
    "ContactUdfValues",
    "ClientUdfValues",
    "ClientActivity",
    "ClientNotes",
    "NoteText",
  ],
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
      providesTags: [{ type: "Clients", id: "ALL" }], // refreshed after Add client
    }),
    // Fired when a client is selected (folder id + client id) and cached for the session — see clientsUiSlice.
    getClientCard: builder.query<DocusoftClientCard, { projectId: number; clientId: string }>({
      query: ({ projectId, clientId }) => ({
        method: "Json_GetClientCardDetails",
        params: { intProjectId: projectId, strOrignatorNumber: clientId },
      }),
      transformResponse: (response: unknown) => parseMaybeString<DocusoftClientCard>(response),
      providesTags: (_r, _e, { clientId }) => [{ type: "ClientCard", id: clientId }], // refreshed after Edit client
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
      providesTags: (_r, _e, { clientId }) => [{ type: "Contacts", id: clientId }], // refreshed after Add contact
    }),
    // Documents DocuSoft holds against a box number (Json_GetAllSearchItemsByBoxNumber -> Table6). Needs the user's
    // ProjectId, saved at login from Json_GetAccessToken.
    getDocumentsByBoxNumber: builder.query<DocusoftBoxDocument[], string>({
      providesTags: (_result, _error, boxNumber) => [{ type: "BoxDocs", id: boxNumber }], // refreshed after an upload
      async queryFn(boxNumber, _api, _extra, baseQuery) {
        const projectId = Number(getStoredProjectId())
        if (!Number.isFinite(projectId) || projectId <= 0) {
          return {
            error: {
              message: "No DocuSoft project id yet — please sign in again",
            },
          }
        }
        const res = await baseQuery({
          method: "Json_GetAllSearchItemsByBoxNumber",
          params: { ProjectId: projectId, BoxNUmber: boxNumber },
        })
        if (res.error) return { error: res.error as DocusoftApiError }
        return {
          data: parseMaybeString<{ Table6?: DocusoftBoxDocument[] }>(res.data).Table6 ?? [],
        }
      },
    }),
    // Sections of a DocuSoft folder (project) — the id and name go into Json_RegisterItem when uploading.
    getSections: builder.query<DocusoftSection[], number>({
      query: (projectId) => ({
        method: "Json_GetSections",
        params: { ProjectId: projectId },
      }),
      transformResponse: (response: unknown) => parseMaybeString<{ Table?: DocusoftSection[] }>(response).Table ?? [],
    }),
    getClientAddresses: builder.query<DocusoftAddress[], string>({
      query: (clientId) => ({
        method: "Json_GetClientAddresses",
        params: { clientId },
      }),
      transformResponse: (response: unknown) => parseMaybeString<{ Table?: DocusoftAddress[] }>(response).Table ?? [],
      providesTags: (_r, _e, clientId) => [{ type: "ClientAddresses", id: clientId }],
    }),
    getFolderClients: builder.query<DocusoftClient[], number>({
      query: (projectId) => ({
        method: "Json_GetClientsByFolder",
        params: { ProjectId: projectId },
      }),
      // Every client carries the folder it was listed under as `ProjectId`.
      transformResponse: (response: { Table1?: DocusoftClient[] }, _meta, projectId) =>
        (response.Table1 ?? []).map((c) => ({ ...c, ProjectId: projectId })),
      providesTags: (_r, _e, projectId) => [{ type: "Clients", id: `folder:${projectId}` }],
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
            const res = await baseQuery({
              method: "Json_GetClientsByFolder",
              params: { ProjectId: folder.FolderID },
            })
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
      // One Json_GetClientsByFolder per folder — so it is refreshed only when a client is ADDED (not on edits; see
      // updateClient, which patches the cached name instead).
      providesTags: [{ type: "Clients", id: "DETAILS" }],
    }),

    // --- Add client / Add contact (top bar → Add client). Reference: docusoftpractice add_client.js --------------
    getConfiguration: builder.query<DocusoftConfiguration, void>({
      query: () => ({ method: "Json_GetConfiguration" }),
      transformResponse: (response: unknown) => {
        const t = parseMaybeString<Record<string, unknown>>(response)
        const list = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : [])
        return {
          statuses: list(t.Table),
          businesses: list(t.Table1),
          sources: list(t.Table2),
          users: list(t.Table3),
        }
      },
    }),
    // Json_AddClient answers {"Status":"Success"}; anything else is shown as DocuSoft's reply (usually: the reference
    // is already used — there is no separate "does it exist" call).
    addClient: builder.mutation<true, NewClientInput>({
      async queryFn(input, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_AddClient",
          params: {
            ProjectIdList: input.folderIds.join(","),
            OriginatorNo: input.clientId,
            OriginatorName: input.name,
            Address: input.address,
            TelNo: input.tel,
            AlteTelNo: input.altTel,
            Faxno: "",
            ContactName: "",
            OrgActive: input.active,
            UDF1: "",
            UDF2: "",
            UDF3: "",
            StickyNote: "",
            ContactEmail: input.email,
            MParameter: "",
            CDate: new Date().toJSON().slice(0, 10),
            BussId: input.businessId || 0,
            SourceId: input.sourceId || 0,
            StatusId: input.statusId || 0,
            Description: input.description,
            OrgPassword: "",
            ManagerId: input.managerId,
          },
        })
        if (res.error) return { error: res.error as DocusoftApiError }
        return successOrError(res.data, "DocuSoft did not add the client — that reference may already be in use")
      },
      invalidatesTags: (_r, error, { folderIds }) =>
        error
          ? []
          : [
              { type: "Clients", id: "ALL" },
              { type: "Clients", id: "DETAILS" },
              ...folderIds.map((id) => ({ type: "Clients" as const, id: `folder:${id}` })),
            ],
    }),
    setClientAddress: builder.mutation<true, ClientAddressInput>({
      async queryFn(a, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_SetClientAddress",
          params: {
            OriginatorNo: a.clientId,
            AddressId: a.addressId,
            AddressType: ADDRESS_TYPE[a.addressId],
            Add1: a.add1,
            Add2: a.add2,
            Add3: a.add3,
            Town: a.town,
            County: a.county,
            Postcode: a.postcode,
            Country: a.country,
          },
        })
        return res.error ? { error: res.error as DocusoftApiError } : successOrError(res.data)
      },
      invalidatesTags: (_r, _e, { clientId }) => [{ type: "ClientAddresses", id: clientId }],
    }),
    // Edit client — Json_UpdateClient, as DocuSoft's own page sends it (add_client.js UpdateClientDetails). It always
    // blanks ContactEmail and StickyNote, so the email is saved afterwards with updateClientField ("Email"), and CCode
    // goes back exactly as Json_GetClientCardDetails gave it. Answers "Success".
    updateClient: builder.mutation<true, UpdateClientInput>({
      async queryFn(input, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_UpdateClient",
          params: {
            OriginatorNo: input.clientId,
            OriginatorName: input.name,
            Address: input.address,
            TelNo: input.tel,
            AlteTelNo: input.altTel,
            Faxno: "",
            ContactName: "",
            OrgActive: input.active,
            StickyNote: "",
            ContactEmail: "",
            BussId: input.businessId || 0,
            SourceId: input.sourceId || 0,
            StatusId: input.statusId || 0,
            Description: input.description,
            OrgPassword: input.orgPassword,
            ManagerId: input.managerId,
            CCode: input.cCode,
          },
        })
        if (res.error) return { error: res.error as DocusoftApiError }
        return successOrError(res.data, "DocuSoft did not update the client — please try again")
      },
      invalidatesTags: (_r, _e, { clientId }) => [{ type: "ClientCard", id: clientId }],
      // The client lists only show id + name: patch the name in the cached lists instead of refetching them (the
      // merged list alone costs one Json_GetClientsByFolder per folder).
      async onQueryStarted({ clientId, name }, { dispatch, getState, queryFulfilled }) {
        try {
          await queryFulfilled
        } catch {
          return
        }
        const util = docusoftApi.util
        dispatch(
          util.updateQueryData("getAllClients", undefined, (list) => {
            for (const c of list) if (c.ClientId === clientId) c.Client = name
          }),
        )
        dispatch(
          util.updateQueryData("getClientsWithDetails", undefined, (list) => {
            for (const c of list) if (c.ClientId === clientId) c.Client = name
          }),
        )
        for (const projectId of util.selectCachedArgsForQuery(getState() as never, "getFolderClients")) {
          dispatch(
            util.updateQueryData("getFolderClients", projectId, (list) => {
              for (const c of list) if (c.ClientID === clientId) c.Client = name
            }),
          )
        }
      },
    }),
    // One field of a client (e.g. "Email"). Note DocuSoft's lowercase `projectid`.
    updateClientField: builder.mutation<
      true,
      { clientId: string; projectId: number; fieldName: string; fieldValue: string }
    >({
      async queryFn(f, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_UpdateClientField",
          params: { projectid: f.projectId, ClientId: f.clientId, fieldName: f.fieldName, fieldValue: f.fieldValue },
        })
        return res.error ? { error: res.error as DocusoftApiError } : successOrError(res.data)
      },
      invalidatesTags: (_r, _e, { clientId, projectId }) => [
        { type: "ClientCard", id: clientId },
        { type: "ClientUdfValues", id: `${clientId}:${projectId}` },
      ],
    }),
    // A client's UDF values in one folder (Overview → UDF Details), as DocuSoft's client card loads them
    // (client_card_details.js): Table = the tags, Table1 = every field with its UdfValue — the same shape as a contact's.
    // Each value is saved with updateClientField (fieldName = the field's name).
    getClientUdfValues: builder.query<DocusoftContactUdfValues, { projectId: number; clientId: string }>({
      query: ({ projectId, clientId }) => ({
        method: "Json_GetCRMUDFValuesByClientId",
        params: { ProjectId: projectId, ClientId: clientId },
      }),
      transformResponse: (response: unknown) => {
        const t = parseMaybeString<Record<string, unknown>>(response)
        const list = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : [])
        return { tags: list(t.Table), fields: list(t.Table1) }
      },
      providesTags: (_r, _e, { clientId, projectId }) => [{ type: "ClientUdfValues", id: `${clientId}:${projectId}` }],
      keepUnusedDataFor: 60,
    }),
    // Linked date UDFs: when a date UDF changes, the date fields that are worked out from it (e.g. reminders) and their
    // recalculated dates — as DocuSoft's client card does (client_card_details.js Json_GetUdfValueByLinkedUdf1). Answers
    // { "": [{ Name, UdfId, UdfValue }] }. Read-only: each date is saved only when the user approves it.
    getLinkedUdfDates: builder.mutation<
      { name: string; udfId: string; value: string }[],
      { projectId: number; fieldId: number | string; date: string } // date: yyyy/mm/dd
    >({
      async queryFn({ projectId, fieldId, date }, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_GetUdfValueByLinkedUdf",
          params: { projectid: projectId, LinkedUdfId: fieldId, LinkedDateValue: date },
        })
        if (res.error) return { error: res.error as DocusoftApiError }
        const t = parseMaybeString<Record<string, unknown>>(res.data)
        const rows = (Array.isArray(t[""]) ? t[""] : Array.isArray(t.Table) ? t.Table : []) as Record<string, unknown>[]
        return {
          data: rows
            .map((r) => ({
              name: String(r.Name ?? "").trim(),
              udfId: String(r.UdfId ?? r.UserDefFieldID ?? "").trim(),
              value: String(r.UdfValue ?? "").trim(),
            }))
            .filter((r) => r.name && r.value && r.udfId !== String(fieldId)),
        }
      },
    }),
    // How many documents DocuSoft holds for a client, per day they were received (Overview → Document count) — as
    // DocuSoft's client card loads it (client_card_details.js Json_GetDocumentCountByDate): note the login email goes
    // under "email" here. Table rows: RcvDate "/Date(ms)/", DocumentCount → { date: yyyy-mm-dd, count }, oldest first.
    getDocumentCounts: builder.query<{ date: string; count: number }[], { clientId: string; projectId: number }>({
      query: ({ clientId, projectId }) => ({
        method: "Json_GetDocumentCountByDate",
        params: { ClientId: clientId, ProjectId: projectId },
        emailKey: "email",
      }),
      transformResponse: (response: unknown) => {
        const rows =
          typeof response === "string"
            ? []
            : (parseMaybeString<{ Table?: Record<string, unknown>[] }>(response).Table ?? [])
        return rows
          .map((r) => {
            const ms = String(r.RcvDate ?? "").match(/-?\d{6,}/)
            const d = ms ? new Date(Number(ms[0])) : new Date(String(r.RcvDate ?? ""))
            return {
              // the calendar day DocuSoft stamped (UTC, as its own page reads it)
              date: Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10),
              count: Number(r.DocumentCount ?? 0) || 0,
            }
          })
          .filter((r) => r.date && r.count > 0)
          .sort((a, b) => a.date.localeCompare(b.date))
      },
      keepUnusedDataFor: 300,
    }),
    // DocuSoft's own activity log of a client (Activity tab → DocuSoft), newest first — as DocuSoft's client card loads
    // it (Json_GetActivityByClientId → Table rows: ActivityDate "/Date(ms)/", username, Notes, Status).
    getClientActivity: builder.query<DocusoftActivity[], string>({
      query: (clientId) => ({ method: "Json_GetActivityByClientId", params: { ClientId: clientId } }),
      transformResponse: (response: unknown) => {
        const rows =
          typeof response === "string"
            ? []
            : (parseMaybeString<{ Table?: Record<string, unknown>[] }>(response).Table ?? [])
        return rows
          .map((r, i) => {
            const ms = String(r.ActivityDate ?? "").match(/-?\d{6,}/)
            const date = ms ? new Date(Number(ms[0])) : new Date(String(r.ActivityDate ?? ""))
            return {
              key: String(r.ActivityId ?? r.ID ?? i),
              at: Number.isNaN(date.getTime()) ? "" : date.toISOString(),
              user: String(r.username ?? r.UserName ?? "").trim(),
              note: String(r.Notes ?? "").trim(),
              status: String(r.Status ?? "").trim(),
            }
          })
          .sort((a, b) => b.at.localeCompare(a.at))
      },
      providesTags: (_r, _e, clientId) => [{ type: "ClientActivity", id: clientId }],
      keepUnusedDataFor: 60,
    }),
    // One line in DocuSoft's activity log of a client (e.g. "UDF Process updated from … to …") — DocuSoft records who
    // and when. Same call as DocuSoft's AddActivityTable (CommanCLS Json_AddSupplierActivityClient). Answers "Success".
    addClientActivity: builder.mutation<true, { clientId: string; note: string }>({
      async queryFn({ clientId, note }, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_AddSupplierActivity",
          params: {
            OriginatorNo: clientId,
            Notes: note,
            Status: "MCO",
            TaskId: 0,
            TaskName: "",
            ActionReminder: "",
            ActivityLevelID: "",
            ItemId: "",
          },
        })
        return res.error
          ? { error: res.error as DocusoftApiError }
          : successOrError(res.data, "DocuSoft did not record the activity")
      },
      invalidatesTags: (_r, _e, { clientId }) => [{ type: "ClientActivity", id: clientId }],
    }),
    // --- Notes of a client (Notes tab). "general" = the client's sticky note (Json_Get/SetStickyNotes); the others are
    // DocuSoft's named notes. Texts are stored as base64 HTML — see lib/docusoftNotes. Parameters as DocuSoft's client
    // card sends them (client_card_details.js notes widget).
    getClientNotes: builder.query<DocusoftNote[], string>({
      query: (clientId) => ({ method: "Json_Get_All_DS_Notes", params: { OriginatorNo: clientId } }),
      transformResponse: (response: unknown) =>
        typeof response === "string" ? [] : (parseMaybeString<{ Table?: DocusoftNote[] }>(response).Table ?? []),
      providesTags: (_r, _e, clientId) => [{ type: "ClientNotes", id: clientId }],
      keepUnusedDataFor: 60,
    }),
    getNoteText: builder.query<string, { clientId: string; noteId: string }>({
      query: ({ clientId, noteId }) =>
        noteId === GENERAL_NOTE
          ? { method: "Json_GetStickyNotes", params: { OriginatorNo: clientId } }
          : { method: "Json_Get_DS_NotesById", params: { NoteId: noteId, OriginatorNo: clientId } },
      transformResponse: (response: unknown) => noteToText(response),
      providesTags: (_r, _e, { clientId, noteId }) => [{ type: "NoteText", id: `${clientId}:${noteId}` }],
      keepUnusedDataFor: 0, // always the latest when a note is opened
    }),
    saveNoteText: builder.mutation<true, { clientId: string; noteId: string; text: string }>({
      async queryFn({ clientId, noteId, text }, _api, _extra, baseQuery) {
        const encoded = textToNote(text)
        const res = await baseQuery(
          noteId === GENERAL_NOTE
            ? { method: "Json_SetStickyNotes", params: { OriginatorNo: clientId, strStickyNotes: encoded } }
            : { method: "Json_DS_NotesSave", params: { OriginatorNo: clientId, NoteId: noteId, Notes: encoded } },
        )
        return res.error
          ? { error: res.error as DocusoftApiError }
          : successOrError(res.data, "DocuSoft did not save the note — please try again")
      },
      invalidatesTags: (_r, _e, { clientId, noteId }) => [{ type: "NoteText", id: `${clientId}:${noteId}` }],
    }),
    addClientNote: builder.mutation<true, { clientId: string; name: string; color: string }>({
      async queryFn({ clientId, name, color }, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_DS_NotesAdd",
          params: { NoteName: name, NoteColor: color, OriginatorNo: clientId },
        })
        return res.error
          ? { error: res.error as DocusoftApiError }
          : successOrError(res.data, "DocuSoft did not add the note — please try again")
      },
      invalidatesTags: (_r, _e, { clientId }) => [{ type: "ClientNotes", id: clientId }],
    }),
    deleteClientNote: builder.mutation<true, { clientId: string; noteId: string }>({
      async queryFn({ clientId, noteId }, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_DS_NotesDelete",
          params: { NoteId: noteId, OriginatorNo: clientId },
        })
        return res.error
          ? { error: res.error as DocusoftApiError }
          : unlessFailed(res.data, "DocuSoft did not delete the note — please try again")
      },
      invalidatesTags: (_r, _e, { clientId }) => [{ type: "ClientNotes", id: clientId }],
    }),
    // PortalUserAccountCreated_Json (DocuSoft's portal services, not PracticeServices): makes a contact a portal user —
    // called straight after the contact is added, as docusoftpractice onboard.js does. Its own credential keys (accid /
    // email / password), the settings fixed as asked. Answers { d: "" } when created, else the reason in `d`.
    createPortalUser: builder.mutation<
      true,
      { clientId: string; clientName: string; contactEmail: string; options?: Partial<PortalUserOptions> }
    >({
      async queryFn({ clientId, clientName, contactEmail, options }) {
        const creds = getDocusoftCredentials()
        if (!creds) return { error: { message: "Not connected to DocuSoft — please sign in again" } }
        try {
          const res = await fetch(`${DOCUSOFT_PORTAL_URL}/PortalUserAccountCreated_Json`, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              accid: creds.agrno,
              email: creds.Email,
              password: creds.password,
              ...DEFAULT_PORTAL_OPTIONS,
              ...options,
              emailAddress: contactEmail,
              ccode: clientId,
              clientName,
            }),
          })
          if (!res.ok) return { error: { message: `DocuSoft portal error: ${res.status} ${res.statusText}` } }
          const { d } = (await res.json()) as { d?: unknown }
          const reason = typeof d === "string" ? d.trim() : ""
          return reason ? { error: { message: reason } } : { data: true as const }
        } catch (err) {
          return { error: { message: err instanceof Error ? err.message : "Network error calling DocuSoft's portal" } }
        }
      },
      invalidatesTags: (_r, _e, { clientId }) => [
        { type: "Contacts", id: clientId },
        { type: "ClientCard", id: clientId },
      ],
    }),
    // Json_InsertContact takes the login email as `strEmail` (the `email` key is the contact's own); answers
    // {"Status":"Success","ContactNo":"…"} — returns the new contact's number.
    insertContact: builder.mutation<string, NewContactInput>({
      async queryFn(c, _api, _extra, baseQuery) {
        const creds = getDocusoftCredentials()
        if (!creds)
          return {
            error: {
              message: "Not connected to DocuSoft — please sign in again",
            },
          }
        const res = await baseQuery({
          method: "Json_InsertContact",
          params: {
            strEmail: creds.Email,
            accid: creds.agrno,
            CCode: c.clientId,
            Salutation: c.salutation,
            FirstName: c.firstName,
            LastName: c.lastName,
            greeting: c.greeting,
            email: c.email,
            Tel: c.tel,
            Mobile: c.mobile,
            Add1: c.add1,
            Add2: c.add2,
            Add3: c.add3,
            Town: c.town,
            PostCode: c.postcode,
            Country: c.country,
            ManagerName: c.managerName,
            AssignedManager: c.managerId || 0,
            Role: c.role,
            note: c.note,
            CActive: yesNo(c.active),
            maincontact: c.mainContact ? 1 : 0,
          },
        })
        if (res.error) return { error: res.error as DocusoftApiError }
        const saved = successOrError(res.data, "DocuSoft did not add the contact — that email may already be in use")
        if ("error" in saved) return saved
        const contactNo = (res.data as { ContactNo?: unknown }).ContactNo
        return { data: String(contactNo ?? "").trim() }
      },
      invalidatesTags: (_r, _e, { clientId }) => [
        { type: "Contacts", id: clientId },
        { type: "ClientCard", id: clientId },
      ],
    }),
    // Edit contact — Json_UpdateContact, as DocuSoft's own contact page sends it (contactonboard.js
    // saveContactandUpdate). There is no contact number in it: DocuSoft finds the contact by the client (CCode) and the
    // email it HAD (`emailupdate`); `Contactemail` is the new email. Answers "Success". County ("State") is not in it —
    // save that with updateContactField afterwards.
    updateContact: builder.mutation<true, NewContactInput & { originalEmail: string }>({
      async queryFn(c, _api, _extra, baseQuery) {
        const creds = getDocusoftCredentials()
        if (!creds) return { error: { message: "Not connected to DocuSoft — please sign in again" } }
        const res = await baseQuery({
          method: "Json_UpdateContact",
          params: {
            accid: creds.agrno,
            CCode: c.clientId,
            Salutation: c.salutation,
            FirstName: c.firstName,
            LastName: c.lastName,
            greeting: c.greeting,
            Contactemail: c.email,
            emailupdate: c.originalEmail,
            Tel: c.tel,
            Mobile: c.mobile,
            Add1: c.add1,
            Add2: c.add2,
            Add3: c.add3,
            Town: c.town,
            PostCode: c.postcode,
            Country: c.country,
            ManagerName: c.managerName,
            AssignedManager: c.managerId || 0,
            Role: c.role,
            note: c.note,
            CActive: yesNo(c.active),
            maincontact: c.mainContact,
          },
        })
        if (res.error) return { error: res.error as DocusoftApiError }
        return successOrError(res.data, "DocuSoft did not update the contact — please try again")
      },
      invalidatesTags: (_r, _e, { clientId }) => [
        { type: "Contacts", id: clientId },
        { type: "ClientCard", id: clientId }, // the Users tab lists the card's contacts
      ],
    }),
    // One field of a contact (e.g. "State" — Json_InsertContact has no county, DocuSoft's page saves it this way right
    // after the insert). Note DocuSoft's lowercase `projectid`.
    updateContactField: builder.mutation<
      true,
      { clientId: string; projectId: number; contactNo: string; fieldName: string; fieldValue: string }
    >({
      async queryFn(f, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_UpdateContactField",
          params: {
            ClientId: f.clientId,
            projectid: f.projectId,
            ContactNo: f.contactNo,
            fieldName: f.fieldName,
            fieldValue: f.fieldValue,
          },
        })
        return res.error ? { error: res.error as DocusoftApiError } : successOrError(res.data)
      },
      invalidatesTags: (_r, _e, { clientId, contactNo }) => [
        { type: "Contacts", id: clientId },
        { type: "ClientCard", id: clientId },
        { type: "ContactUdfValues", id: `${clientId}:${contactNo}` },
      ],
    }),
    // One contact's UDF values (Edit contact → UDF Details), as DocuSoft's contact page loads them (onboard.js
    // GetCRMContactUDFValues): Table = the tags, Table1 = every field with its UdfValue (drop-down options in
    // `Options`, separated by "@;"). Each value is saved with updateContactField (fieldName = the field's name).
    getContactUdfValues: builder.query<
      DocusoftContactUdfValues,
      { projectId: number; clientId: string; contactNo: string }
    >({
      query: ({ projectId, clientId, contactNo }) => ({
        method: "Json_GetCRMContactUDFValues",
        params: { ProjectId: projectId, ClientId: clientId, ContactId: contactNo },
      }),
      transformResponse: (response: unknown) => {
        const t = parseMaybeString<Record<string, unknown>>(response)
        const list = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : [])
        return { tags: list(t.Table), fields: list(t.Table1) }
      },
      providesTags: (_r, _e, { clientId, contactNo }) => [{ type: "ContactUdfValues", id: `${clientId}:${contactNo}` }],
      keepUnusedDataFor: 60,
    }),
    // The users of a folder — the choices of a "UserList" UDF (DocuSoft stores the user's name, `ForwardTo`).
    getForwardUsers: builder.query<{ ForwardTo: string; [key: string]: unknown }[], number>({
      query: (projectId) => ({ method: "Json_GetForwardUserList", params: { ProjectId: projectId, SectionId: "-1" } }),
      transformResponse: (response: unknown) =>
        parseMaybeString<{ Table?: { ForwardTo: string }[] }>(response).Table ?? [],
    }),

    // --- Contact UDFs (Settings → Contact UDF). Parameter names copied exactly from DocuSoft's ContactUdf.js. ---------
    getContactUdfs: builder.query<DocusoftContactUdfs, number>({
      query: (projectId) => ({ method: "Json_GetUDFDetails", params: { ProjectId: projectId, UDFType: 2 } }),
      transformResponse: (response: unknown) => {
        const t = parseMaybeString<Record<string, unknown>>(response)
        const list = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : [])
        return { tags: list(t.Table), fields: list(t.Table1), options: list(t.Table2) }
      },
      providesTags: (_r, _e, projectId) => [{ type: "ContactUdfs", id: projectId }],
      keepUnusedDataFor: 60, // edited on that screen
    }),
    addContactUdf: builder.mutation<true, ContactUdfInput>({
      async queryFn(u, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_AddContactUDF",
          params: {
            ProjectId: String(u.projectId),
            Name: u.name,
            TooltipText: u.tooltip,
            TextControlValue: u.format,
            SequenceNo: "0",
            TextValue: u.formula,
            Tag: u.tag,
            UserDefFieldTypeID: u.typeId,
            blnForClientView: u.forClientView,
            blnForClientEdit: u.forClientEdit,
          },
        })
        if (res.error) return { error: res.error as DocusoftApiError }
        const saved = successOrError(res.data)
        if ("error" in saved && /already exists/i.test(saved.error.message)) {
          return { error: { message: `There is already a field called "${u.name}" in this folder` } }
        }
        return saved
      },
      invalidatesTags: (_r, _e, { projectId }) => [{ type: "ContactUdfs", id: projectId }],
    }),
    updateContactUdf: builder.mutation<true, ContactUdfInput & { fieldId: number | string }>({
      async queryFn(u, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_Update_ContactUDF_Details",
          params: {
            ProjectId: String(u.projectId),
            UserDefFieldID: u.fieldId,
            UserDefFieldTypeID: u.typeId,
            Tag: u.tag,
            Name: u.name,
            TooltipText: u.tooltip,
            Sort: "",
            TextControlValue: u.format,
            SequenceNo: 0,
            TextValue: u.formula,
            Template: "",
            blnForClientView: u.forClientView,
            blnForClientEdit: u.forClientEdit,
          },
        })
        return res.error ? { error: res.error as DocusoftApiError } : successOrError(res.data)
      },
      invalidatesTags: (_r, _e, { projectId }) => [{ type: "ContactUdfs", id: projectId }],
    }),
    // Whether contacts already hold values for this field (DocuSoft then refuses changes / deletion). Answers true / false.
    checkContactUdfInUse: builder.mutation<boolean, { projectId: number; fieldId: number | string }>({
      async queryFn({ projectId, fieldId }, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_ToCheckUDFValue",
          params: { ProjectId: String(projectId), UserDefFieldID: fieldId },
        })
        if (res.error) return { error: res.error as DocusoftApiError }
        return { data: res.data === true || String(res.data).trim().toLowerCase() === "true" }
      },
    }),
    deleteContactUdf: builder.mutation<true, { projectId: number; fieldId: number | string }>({
      async queryFn({ projectId, fieldId }, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_Delete_ContactUDF",
          params: { ProjectId: String(projectId), UserDefFieldID: fieldId },
        })
        return res.error
          ? { error: res.error as DocusoftApiError }
          : unlessFailed(res.data, "DocuSoft did not delete the field — please try again")
      },
      invalidatesTags: (_r, _e, { projectId }) => [{ type: "ContactUdfs", id: projectId }],
    }),
    addContactUdfOption: builder.mutation<true, { projectId: number; fieldId: number | string; value: string }>({
      async queryFn({ projectId, fieldId, value }, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_InsertContactUdf_ListValue",
          params: { ProjectId: String(projectId), UserDefFieldID: fieldId, Value: value, Name: "", ColorID: 0 },
        })
        return res.error
          ? { error: res.error as DocusoftApiError }
          : unlessFailed(res.data, "DocuSoft did not add the option — please try again")
      },
      invalidatesTags: (_r, _e, { projectId }) => [{ type: "ContactUdfs", id: projectId }],
    }),
    updateContactUdfOption: builder.mutation<
      true,
      { projectId: number; fieldId: number | string; listId: number | string; value: string }
    >({
      async queryFn({ projectId, fieldId, listId, value }, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_UpdateContactUdf_ListValue",
          params: {
            ProjectId: String(projectId),
            UserDefFieldID: fieldId,
            ListID: listId,
            Value: value,
            Name: "",
            ColorID: 0,
          },
        })
        return res.error
          ? { error: res.error as DocusoftApiError }
          : unlessFailed(res.data, "DocuSoft did not change the option — please try again")
      },
      invalidatesTags: (_r, _e, { projectId }) => [{ type: "ContactUdfs", id: projectId }],
    }),
    // listId 0 = every option of the field (used before changing its type / deleting it, as DocuSoft's page does)
    deleteContactUdfOption: builder.mutation<
      true,
      { projectId: number; fieldId: number | string; listId: number | string }
    >({
      async queryFn({ projectId, fieldId, listId }, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_DeleteContactUdf_ListValue",
          params: { ProjectId: String(projectId), UserDefFieldID: fieldId, ListID: listId },
        })
        return res.error
          ? { error: res.error as DocusoftApiError }
          : unlessFailed(res.data, "DocuSoft did not delete the option — please try again")
      },
      invalidatesTags: (_r, _e, { projectId }) => [{ type: "ContactUdfs", id: projectId }],
    }),

    // --- DMS Reference UDFs (Settings → Custom fields → DocuSoft reference fields) ---------------------------------
    // Parameter names are DocuSoft's, copied exactly — Add and Update spell the same things differently.
    getReferenceUdfs: builder.query<DocusoftReferenceUdf[], { clientId: string; projectId: number }>({
      query: ({ clientId, projectId }) => ({
        method: "Json_GetReferenceUDFDetails",
        params: { OriginatorNo: clientId, ProjectId: projectId },
      }),
      transformResponse: (response: unknown) =>
        parseMaybeString<{ Table?: DocusoftReferenceUdf[] }>(response).Table ?? [],
      providesTags: (_r, _e, { clientId, projectId }) => [{ type: "ReferenceUdfs", id: `${clientId}:${projectId}` }],
      keepUnusedDataFor: 60, // edited from this screen; don't keep a stale copy for the day
    }),
    addReferenceUdf: builder.mutation<true, ReferenceUdfInput>({
      async queryFn(input, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_Add_Reference_UDFDetails",
          params: {
            OriginatorNo: input.clientId,
            ProjectId: input.projectId,
            UDFName: input.name,
            UserDefFiledTypId: input.typeId,
            TextControlValue: input.format,
            tooltipText: input.tooltip,
            UDFHide: yesNo(input.hidden),
            CanUpdate: yesNo(input.updatable),
            Mandatery: yesNo(input.mandatory),
          },
        })
        return res.error ? { error: res.error as DocusoftApiError } : successOrError(res.data)
      },
      invalidatesTags: (_r, _e, { clientId, projectId }) => [{ type: "ReferenceUdfs", id: `${clientId}:${projectId}` }],
    }),
    updateReferenceUdf: builder.mutation<true, ReferenceUdfInput & { fieldId: number | string }>({
      async queryFn(input, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_Update_ReferenceUdfDetails",
          params: {
            OriginatorNo: input.clientId,
            ProjectId: input.projectId,
            UserDefFieldID: input.fieldId,
            UserDefFieldTypeID: input.typeId,
            UdfName: input.name,
            TextControlValue: input.format,
            tooltipText: input.tooltip,
            UDFHide: yesNo(input.hidden),
            CanUpdate: yesNo(input.updatable),
            Mandatory: yesNo(input.mandatory),
          },
        })
        return res.error ? { error: res.error as DocusoftApiError } : successOrError(res.data)
      },
      invalidatesTags: (_r, _e, { clientId, projectId }) => [{ type: "ReferenceUdfs", id: `${clientId}:${projectId}` }],
    }),
    // Options of a Combo field. DocuSoft may return other fields' options too, so keep only this field's.
    getReferenceUdfOptions: builder.query<DocusoftReferenceUdfOption[], { clientId: string; fieldId: number | string }>(
      {
        query: ({ clientId, fieldId }) => ({
          method: "Json_Get_ReferenceListUdfValue",
          params: { OriginatorNo: clientId, UserdefFieldId: fieldId },
        }),
        transformResponse: (response: unknown, _meta, { fieldId }) =>
          (parseMaybeString<{ Table?: DocusoftReferenceUdfOption[] }>(response).Table ?? []).filter(
            (o) => String(o.UserDefFieldID) === String(fieldId),
          ),
        providesTags: (_r, _e, { clientId, fieldId }) => [
          { type: "ReferenceUdfOptions", id: `${clientId}:${fieldId}` },
        ],
        keepUnusedDataFor: 60,
      },
    ),
    addReferenceUdfOption: builder.mutation<
      true,
      {
        clientId: string
        fieldId: number | string
        fieldName: string
        value: string
      }
    >({
      async queryFn({ clientId, fieldId, fieldName, value }, _api, _extra, baseQuery) {
        const res = await baseQuery({
          method: "Json_Add_ReferenceUDFListValue",
          params: {
            OriginatorNo: clientId,
            UserDefFieldId: fieldId,
            ListUdfName: fieldName,
            Value: value,
          },
        })
        return res.error ? { error: res.error as DocusoftApiError } : successOrError(res.data)
      },
      // refresh the list whatever the answer was, so a saved option always shows
      invalidatesTags: (_r, _e, { clientId, fieldId }) => [
        { type: "ReferenceUdfOptions", id: `${clientId}:${fieldId}` },
      ],
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
  useGetDocumentsByBoxNumberQuery,
  useGetSectionsQuery,
  useGetReferenceUdfsQuery,
  useAddReferenceUdfMutation,
  useUpdateReferenceUdfMutation,
  useGetReferenceUdfOptionsQuery,
  useAddReferenceUdfOptionMutation,
  useGetConfigurationQuery,
  useAddClientMutation,
  useSetClientAddressMutation,
  useInsertContactMutation,
  useCreatePortalUserMutation,
  useUpdateContactFieldMutation,
  useUpdateClientMutation,
  useUpdateClientFieldMutation,
  useUpdateContactMutation,
  useGetContactUdfsQuery,
  useGetContactUdfValuesQuery,
  useGetClientUdfValuesQuery,
  useGetLinkedUdfDatesMutation,
  useAddClientActivityMutation,
  useGetClientActivityQuery,
  useGetDocumentCountsQuery,
  useGetClientNotesQuery,
  useGetNoteTextQuery,
  useSaveNoteTextMutation,
  useAddClientNoteMutation,
  useDeleteClientNoteMutation,
  useGetForwardUsersQuery,
  useAddContactUdfMutation,
  useUpdateContactUdfMutation,
  useCheckContactUdfInUseMutation,
  useDeleteContactUdfMutation,
  useAddContactUdfOptionMutation,
  useUpdateContactUdfOptionMutation,
  useDeleteContactUdfOptionMutation,
} = docusoftApi
