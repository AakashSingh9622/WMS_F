import { createSlice, type PayloadAction } from "@reduxjs/toolkit"

import type { DocusoftClient } from "@/store/docusoftApi"

// What the user last picked on the Clients screen. Lives in Redux (not component state) so that
// leaving the screen (e.g. to Audit log) and coming back shows the same folder / search / page
// instead of resetting to "Choose a folder". The folder's client list itself is cached by RTK
// Query (docusoftApi.ts), so coming back doesn't re-fetch it either.
export type ClientsFilter = "all" | "storing" | "empty" | "orders" | "owes"
export type ClientsSort = "name" | "boxes" | "balance" | "activity"

interface ClientsUiState {
  folderId: string // "" = all folders
  q: string
  page: number
  filter: ClientsFilter
  sort: ClientsSort
  // The whole client row DocuSoft gave us for the one the user clicked, kept so the client pages
  // (Overview header etc.) can show its name without another API call.
  selectedClient: DocusoftClient | null
}

const initialState: ClientsUiState = {
  folderId: "",
  q: "",
  page: 1,
  filter: "all",
  sort: "name",
  selectedClient: null,
}

const clientsUiSlice = createSlice({
  name: "clientsUi",
  initialState,
  reducers: {
    folderSelected(state, action: PayloadAction<string>) {
      state.folderId = action.payload
      state.q = ""
      state.page = 1
      state.selectedClient = null
    },
    searchChanged(state, action: PayloadAction<string>) {
      state.q = action.payload
      state.page = 1
    },
    clientSelected(state, action: PayloadAction<DocusoftClient>) {
      state.selectedClient = action.payload
    },
    pageChanged(state, action: PayloadAction<number>) {
      state.page = action.payload
    },
    filterChanged(state, action: PayloadAction<ClientsFilter>) {
      state.filter = action.payload
      state.page = 1
    },
    sortChanged(state, action: PayloadAction<ClientsSort>) {
      state.sort = action.payload
      state.page = 1
    },
    // Restores what was saved in sessionStorage (see store/index.ts) after a full page reload.
    // (older saved states have no filter / sort — fall back to the defaults)
    clientsUiRestored: (_state, action: PayloadAction<ClientsUiState>) => ({ ...initialState, ...action.payload }),
    clientsUiReset: () => initialState,
  },
})

export type { ClientsUiState }
export const {
  folderSelected,
  searchChanged,
  pageChanged,
  filterChanged,
  sortChanged,
  clientSelected,
  clientsUiRestored,
  clientsUiReset,
} = clientsUiSlice.actions
export default clientsUiSlice.reducer
