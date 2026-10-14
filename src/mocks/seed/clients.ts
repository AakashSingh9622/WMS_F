import type { Client, ClientAttribute } from "@/api/types"
import { pick, seededInt } from "@/mocks/prng"

// Kept small on purpose (spec §6's ~25/~1200 scale traded for something a person can
// actually click through end to end) — client-1/client-2 stay Acme/Globex so the seeded
// demo users (client@demo.test / viewer@demo.test) keep pointing at real clients.
const COMPANY_NAMES = [
  "Acme Legal Partners", "Globex Insurance", "Initech Financial",
  "Umbrella Health Records", "Hooli Logistics", "Soylent Accountancy",
] as const

const INDUSTRIES = ["Legal", "Insurance", "Finance", "Healthcare", "Logistics", "Manufacturing", "Retail", "Media"]
const CITIES = ["London", "Manchester", "Birmingham", "Leeds", "Bristol", "Glasgow", "Liverpool"]

function clientCode(name: string, index: number): string {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase()
  return `${initials}${String(index + 1).padStart(2, "0")}`
}

export function generateClients(rng: () => number): Client[] {
  return COMPANY_NAMES.map((name, index) => {
    const code = clientCode(name, index)
    const status = rng() < 0.92 ? "active" : "inactive"
    const city = pick(rng, CITIES)
    const industry = pick(rng, INDUSTRIES)

    const attributes: ClientAttribute[] = [
      { key: "industry", label: "Industry", value: industry, type: "text", group: "Account" },
      {
        key: "accountManager",
        label: "Account manager",
        value: pick(rng, ["Ahmed Khan", "Sara Ali", "Tom Bell", "Priya Nair"]),
        type: "text",
        group: "Account",
      },
      {
        key: "contactEmail",
        label: "Contact email",
        value: `records@${name.toLowerCase().replace(/[^a-z]+/g, "")}.example.com`,
        type: "email",
        group: "Contact",
      },
      {
        key: "contactPhone",
        label: "Contact phone",
        value: `+44 20 ${seededInt(rng, 7000, 7999)} ${seededInt(rng, 1000, 9999)}`,
        type: "phone",
        group: "Contact",
      },
      {
        key: "address",
        label: "Address",
        value: `${seededInt(rng, 1, 200)} ${pick(rng, ["High St", "Kings Rd", "Church Ln", "Station Rd"])}, ${city}`,
        type: "text",
        group: "Contact",
      },
      {
        key: "retentionPolicy",
        label: "Default retention",
        value: pick(rng, ["6 years", "7 years", "10 years", "Indefinite"]),
        type: "text",
        group: "Account",
      },
    ]

    return {
      id: `client-${index + 1}`,
      code,
      name,
      status,
      boxCount: 0, // filled in once boxes are generated (see seed/index.ts)
      openOrderCount: 0,
      attributes,
    }
  })
}
