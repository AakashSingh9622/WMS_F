// Single source of truth for DocuSoft's .asmx API address — change the domain here and every
// DocuSoft call (login user details, folders, clients, ...) follows.
export const DOCUSOFT_BASE_URL = "https://accountancy.mydocusoft.com/PracticeServices.asmx"
// DocuSoft's client portal services (Practice's BaseUrl "portalUrlMydocusoft", UK site) — e.g. creating a portal user.
export const DOCUSOFT_PORTAL_URL = "https://portal.mydocusoft.com/clientservices.asmx"
// The portal's own pages (Practice's BaseUrl "portalManagerurl") and the host they send people back to ("searchViewWWW").
export const DOCUSOFT_PORTAL_SITE = "https://portal.mydocusoft.com"
export const DOCUSOFT_WWW = "http://www.mydocusoft.com"
