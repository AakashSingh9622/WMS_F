import { describe, expect, it } from "vitest"

import reducer, {
  clientSelected,
  clientsUiReset,
  folderSelected,
  pageChanged,
  searchChanged,
} from "@/store/clientsUiSlice"

describe("clientsUiSlice", () => {
  it("remembers the picked folder, search and page", () => {
    let state = reducer(undefined, folderSelected("12"))
    state = reducer(state, searchChanged("tat"))
    state = reducer(state, pageChanged(3))
    expect(state).toEqual({ folderId: "12", q: "tat", page: 3, selectedClient: null })
  })

  it("picking another folder clears the old search and page", () => {
    let state = reducer(undefined, folderSelected("12"))
    state = reducer(state, searchChanged("tat"))
    state = reducer(state, pageChanged(3))
    state = reducer(state, folderSelected("7"))
    expect(state).toEqual({ folderId: "7", q: "", page: 1, selectedClient: null })
  })

  it("a new search goes back to page 1", () => {
    let state = reducer(undefined, pageChanged(4))
    state = reducer(state, searchChanged("x"))
    expect(state.page).toBe(1)
  })

  it("keeps the whole selected client object, and drops it when the folder changes", () => {
    const client = { ClientID: "00092560", Client: "TATA LIMITED" }
    let state = reducer(reducer(undefined, folderSelected("12")), clientSelected(client))
    expect(state.selectedClient).toEqual(client)
    state = reducer(state, folderSelected("7"))
    expect(state.selectedClient).toBeNull()
  })

  it("reset (logout/login) forgets everything", () => {
    const state = reducer(reducer(undefined, folderSelected("12")), clientsUiReset())
    expect(state).toEqual({ folderId: "", q: "", page: 1, selectedClient: null })
  })
})
