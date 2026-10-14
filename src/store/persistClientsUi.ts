import type { Store } from "@reduxjs/toolkit"

import { clientsUiRestored, type ClientsUiState } from "@/store/clientsUiSlice"

// Keeps the Clients screen's picked folder / search / page / selected client in sessionStorage, so even a full
// page reload (F5, opening a client link in a new tab) lands back on the same folder and client instead of an
// empty "Choose a folder". sessionStorage = per tab and gone when the tab closes; logout resets it.
const KEY = "wms_clients_ui"

function isClientsUiState(value: unknown): value is ClientsUiState {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return typeof v.folderId === "string" && typeof v.q === "string" && typeof v.page === "number"
}

/** Call once, on the client, after mount (not during render — the server has no sessionStorage). */
export function restoreAndPersistClientsUi(store: Store<{ clientsUi: ClientsUiState }>): () => void {
  try {
    const raw = sessionStorage.getItem(KEY)
    const saved: unknown = raw ? JSON.parse(raw) : null
    if (isClientsUiState(saved))
      store.dispatch(clientsUiRestored({ ...saved, selectedClient: saved.selectedClient ?? null }))
  } catch {
    // unreadable / blocked storage: just start fresh
  }

  let last = store.getState().clientsUi
  return store.subscribe(() => {
    const next = store.getState().clientsUi
    if (next === last) return
    last = next
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // storage full / blocked: the in-memory state still works
    }
  })
}
