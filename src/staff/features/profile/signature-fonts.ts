import { Allura, Caveat, Dancing_Script, Great_Vibes, Homemade_Apple } from "next/font/google"

// Handwriting fonts for a typed signature (only these — a typed signature should look signed, not typeset).
const greatVibes = Great_Vibes({ weight: "400", subsets: ["latin"], display: "swap" })
const dancingScript = Dancing_Script({ weight: "600", subsets: ["latin"], display: "swap" })
const allura = Allura({ weight: "400", subsets: ["latin"], display: "swap" })
const homemadeApple = Homemade_Apple({ weight: "400", subsets: ["latin"], display: "swap" })
const caveat = Caveat({ weight: "600", subsets: ["latin"], display: "swap" })

export const SIGNATURE_FONTS = [
  { name: "Great Vibes", font: greatVibes },
  { name: "Dancing Script", font: dancingScript },
  { name: "Allura", font: allura },
  { name: "Homemade Apple", font: homemadeApple },
  { name: "Caveat", font: caveat },
] as const
