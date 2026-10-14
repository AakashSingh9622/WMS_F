import { createSlice, type PayloadAction } from "@reduxjs/toolkit"

import type { DocusoftClient } from "@/store/docusoftApi"

// What the user last picked on the Clients screen. Lives in Redux (not component state) so that
// leaving the screen (e.g. to Audit log) and coming back shows the same folder / search / page
// instead of resetting to "Choose a folder". The folder's client list itself is cached by RTK
// Query (docusoftApi.ts), so coming back doesn't re-fetch it either.
interface ClientsUiState {
  folderId: string // "" = no folder picked yet
  q: string
  page: number
  // The whole client row DocuSoft gave us for the one the user clicked, kept so the client pages
  // (Overview header etc.) can show its name without another API call.
  selectedClient: DocusoftClient | null
}

const initialState: ClientsUiState = { folderId: "", q: "", page: 1, selectedClient: null }

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
    // Restores what was saved in sessionStorage (see store/index.ts) after a full page reload.
    clientsUiRestored: (_state, action: PayloadAction<ClientsUiState>) => action.payload,
    clientsUiReset: () => initialState,
  },
})

export type { ClientsUiState }
export const { folderSelected, searchChanged, pageChanged, clientSelected, clientsUiRestored, clientsUiReset } =
  clientsUiSlice.actions
export default clientsUiSlice.reducer
