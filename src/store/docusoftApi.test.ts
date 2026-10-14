import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { configureStore } from "@reduxjs/toolkit"

import { docusoftApi } from "@/store/docusoftApi"

function makeStore() {
  return configureStore({
    reducer: { [docusoftApi.reducerPath]: docusoftApi.reducer },
    middleware: (gdm) => gdm().concat(docusoftApi.middleware),
  })
}

function mockDocusoft(payload: unknown, { doubleEncoded = false } = {}) {
  const inner = doubleEncoded ? JSON.stringify(JSON.stringify(payload)) : JSON.stringify(payload)
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ d: inner }), { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("docusoftApi client card", () => {
  beforeEach(() => {
    localStorage.setItem("wms_docusoft_creds", JSON.stringify({ agrno: "A1", Email: "me@x.com", password: "cGFzcw==" }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it("calls Json_GetClientCardDetails with the creds, folder id and client id, and keeps every table", async () => {
    const card = {
      Table1: [{ OriginatorNo: "00092560", OriginatorName: "TATA LIMITED", Email: "a@tata.com" }],
      Table6: [{ "First Name": "Asha", "Last Name": "Rao", "E-Mail": "asha@tata.com", ContactNo: 7 }],
      Table3: [{ whatever: 1 }],
    }
    const fetchMock = mockDocusoft(card)
    const store = makeStore()

    const result = await store.dispatch(
      docusoftApi.endpoints.getClientCard.initiate({ projectId: 12, clientId: "00092560" }),
    )

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/PracticeServices\.asmx\/Json_GetClientCardDetails$/)
    expect(JSON.parse(String(init.body))).toEqual({
      agrno: "A1",
      Email: "me@x.com",
      password: "cGFzcw==",
      intProjectId: 12,
      strOrignatorNumber: "00092560",
    })
    expect(result.data).toEqual(card) // whole response stored, not just two tables
  })

  it("also understands the double-encoded response DocuSoft sometimes sends", async () => {
    mockDocusoft({ Table1: [{ OriginatorName: "TATA LIMITED" }] }, { doubleEncoded: true })
    const result = await makeStore().dispatch(
      docusoftApi.endpoints.getClientCard.initiate({ projectId: 1, clientId: "x" }),
    )
    expect(result.data?.Table1?.[0]?.OriginatorName).toBe("TATA LIMITED")
  })

  it("fetches a client's addresses by clientId", async () => {
    const fetchMock = mockDocusoft({ Table: [{ AddressId: 1, AddressType: "Main Address", Add1: "RNT Marg" }] })
    const result = await makeStore().dispatch(docusoftApi.endpoints.getClientAddresses.initiate("00092560"))
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).clientId).toBe("00092560")
    expect(result.data).toEqual([{ AddressId: 1, AddressType: "Main Address", Add1: "RNT Marg" }])
  })

  it("is fetched once per client+folder: a second request reuses the cache", async () => {
    const fetchMock = mockDocusoft({ Table1: [{ OriginatorName: "TATA LIMITED" }] })
    const store = makeStore()
    const args = { projectId: 12, clientId: "00092560" }
    await store.dispatch(docusoftApi.endpoints.getClientCard.initiate(args))
    await store.dispatch(docusoftApi.endpoints.getClientCard.initiate(args))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
