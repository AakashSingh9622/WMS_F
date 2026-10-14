import { http, HttpResponse, delay } from "msw"

import { seedUsers } from "@/mocks/seed"

// Only /api/clients/:id/users is still mocked. The client list comes from DocuSoft directly
// (src/store/docusoftApi.ts); detail/boxes/orders hit the real backend (next.config.ts rewrites) --
// a mock handler for those would shadow the rewrite, because MSW intercepts in the browser first.
export const clientHandlers = [
  http.get("/api/clients/:clientId/users", async ({ params }) => {
    await delay(150)
    const users = seedUsers
      .filter((u) => u.side === "client" && u.clientId === params.clientId)
      .map((u) => ({ id: u.id, name: u.name, email: u.email, roles: u.roles }))
    return HttpResponse.json(users)
  }),
]
