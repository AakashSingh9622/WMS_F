import { JetBrains_Mono, Space_Grotesk } from "next/font/google"

// Login page only: a sharper display face for headings and a mono face for the small "RECORDS WAREHOUSE" caption.
export const displayFont = Space_Grotesk({ subsets: ["latin"], variable: "--font-login-display", display: "swap" })
export const monoFont = JetBrains_Mono({ subsets: ["latin"], variable: "--font-login-mono", display: "swap" })
