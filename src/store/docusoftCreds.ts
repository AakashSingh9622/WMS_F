// Plain localStorage helpers for the DocuSoft credentials stashed at login (see
// src/auth/useAuth.tsx) — kept dependency-free (no Redux/React import) so both the RTK Query
// baseQuery (src/store/docusoftApi.ts) and the auth code can both import this one source of truth.
const CREDS_STORAGE_KEY = "wms_docusoft_creds"

export interface DocusoftCreds {
  agrno: string
  Email: string
  password: string // already base64-encoded, same form DocuSoft's API expects
}

/** Called once, right after login — this is the only place a password is ever stored. */
export function storeDocusoftCredentials(creds: DocusoftCreds) {
  localStorage.setItem(CREDS_STORAGE_KEY, JSON.stringify(creds))
}

export function clearDocusoftCredentials() {
  localStorage.removeItem(CREDS_STORAGE_KEY)
}

export function getDocusoftCredentials(): DocusoftCreds | null {
  const raw = localStorage.getItem(CREDS_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DocusoftCreds
  } catch {
    return null
  }
}
