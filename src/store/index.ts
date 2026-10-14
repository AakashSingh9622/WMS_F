import { configureStore } from "@reduxjs/toolkit"
import { setupListeners } from "@reduxjs/toolkit/query"

import { docusoftApi } from "@/store/docusoftApi"
import clientsUiReducer from "@/store/clientsUiSlice"

// This store exists for DocuSoft reference data (folders, clients): the RTK Query cache
// (docusoftApi.ts) plus the Clients screen's last-picked folder/search/page (clientsUiSlice.ts) —
// see docusoftApi.ts for why this uses Redux instead of the TanStack Query that everything else
// in the app uses. Don't add other feature state here; server state for our own backend/mocks
// stays on TanStack Query (src/api/*), per CLAUDE.md.
export const store = configureStore({
  reducer: {
    [docusoftApi.reducerPath]: docusoftApi.reducer,
    clientsUi: clientsUiReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(docusoftApi.middleware),
})

// Enables refetchOnFocus/refetchOnReconnect behavior for RTK Query.
setupListeners(store.dispatch)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
