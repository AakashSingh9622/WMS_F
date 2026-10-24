import type { NextConfig } from "next"

// Auth, Warehouse/Rack/Slot, Box, Order, and Audit are now served by the real backend
// (warehouse-management-system-backend) instead of the MSW mock. These rewrites proxy just
// those paths server-side to that backend — Clients(detail)/Portal stay on MSW until they get
// real backend routes too (see that repo's README "What's next"). DocuSoft's folders/clients
// APIs are NOT proxied here — src/store/docusoftApi.ts calls DocuSoft directly from the browser
// (see that file's comments for why).
const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "https://wms-be-fohy.onrender.com"

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/auth/:path*", destination: `${BACKEND_API_URL}/api/auth/:path*` },
      { source: "/api/warehouses", destination: `${BACKEND_API_URL}/api/warehouses` },
      { source: "/api/warehouses/:path*", destination: `${BACKEND_API_URL}/api/warehouses/:path*` },
      { source: "/api/racks/:path*", destination: `${BACKEND_API_URL}/api/racks/:path*` },
      { source: "/api/slots/:path*", destination: `${BACKEND_API_URL}/api/slots/:path*` },
      { source: "/api/boxes", destination: `${BACKEND_API_URL}/api/boxes` },
      { source: "/api/boxes/:path*", destination: `${BACKEND_API_URL}/api/boxes/:path*` },
      { source: "/api/orders", destination: `${BACKEND_API_URL}/api/orders` },
      { source: "/api/orders/:path*", destination: `${BACKEND_API_URL}/api/orders/:path*` },
      { source: "/api/settings/:path*", destination: `${BACKEND_API_URL}/api/settings/:path*` },
      { source: "/api/audit", destination: `${BACKEND_API_URL}/api/audit` },
      { source: "/api/audit/:path*", destination: `${BACKEND_API_URL}/api/audit/:path*` },
      { source: "/api/admin-audit", destination: `${BACKEND_API_URL}/api/admin-audit` },
      // Warehouse invoices (the Sage calls themselves go from the browser to DocuSoft's proxy, not through here).
      { source: "/api/invoices", destination: `${BACKEND_API_URL}/api/invoices` },
      { source: "/api/invoices/:path*", destination: `${BACKEND_API_URL}/api/invoices/:path*` },
      // Records (retention, legal holds, certificates), pricing & billing, CSV exports, staff notifications.
      { source: "/api/records/:path*", destination: `${BACKEND_API_URL}/api/records/:path*` },
      { source: "/api/billing/:path*", destination: `${BACKEND_API_URL}/api/billing/:path*` },
      { source: "/api/exports/:path*", destination: `${BACKEND_API_URL}/api/exports/:path*` },
      { source: "/api/notifications", destination: `${BACKEND_API_URL}/api/notifications` },
      // Supervisor queue of scans that didn't match.
      { source: "/api/exceptions", destination: `${BACKEND_API_URL}/api/exceptions` },
      { source: "/api/exceptions/:path*", destination: `${BACKEND_API_URL}/api/exceptions/:path*` },
      // Staff users + roles (Settings → Users & roles). Not /api/clients/:id/users — that one is still MSW.
      { source: "/api/users", destination: `${BACKEND_API_URL}/api/users` },
      { source: "/api/users/:path*", destination: `${BACKEND_API_URL}/api/users/:path*` },
      // Per-client detail summary + Boxes/Orders tabs are real; only /users stays on MSW.
      { source: "/api/clients/:clientId", destination: `${BACKEND_API_URL}/api/clients/:clientId` },
      { source: "/api/clients/:clientId/boxes", destination: `${BACKEND_API_URL}/api/clients/:clientId/boxes` },
      { source: "/api/clients/:clientId/orders", destination: `${BACKEND_API_URL}/api/clients/:clientId/orders` },
    ]
  },
}

export default nextConfig
