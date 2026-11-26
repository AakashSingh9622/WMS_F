// DocuSoft keeps a client's notes (the sticky "General" note and the named ones) as base64-encoded HTML — sometimes
// encoded twice, or wrapped in <html><body>. These turn that into plain text for a text box and back, exactly as
// DocuSoft's own client card does (docusoftpractice client_card_details.js ccDecodeStickyNote / ccEncodeNoteText),
// so a note written here reads the same in DocuSoft and the other way round.

/** base64 → text, reading the bytes as UTF-8 (falls back to the raw characters). */
function fromBase64(value: string): string {
  const binary = atob(value)
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
  } catch {
    return binary
  }
}

/** text → base64 of its UTF-8 bytes. */
function toBase64(text: string): string {
  let binary = ""
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** A note as DocuSoft stores it → its HTML (decoded once or twice, the <body> taken out of a whole page). */
function decodeNoteHtml(stored: string): string {
  const raw = stored.trim()
  if (!raw) return ""
  let html: string
  try {
    html = fromBase64(raw)
  } catch {
    html = raw // not base64 — already plain
  }
  if (/<html|<body/i.test(html)) {
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    html = (body?.[1] ?? html).trim()
  }
  const inner = html.match(/>([A-Za-z0-9+/=]{20,})</) // a second base64 layer inside a tag
  if (inner?.[1]) {
    try {
      html = fromBase64(inner[1])
    } catch {
      // keep it as it is
    }
  }
  return html.trim()
}

/** A note as DocuSoft stores it → plain text for a text box (line breaks kept). */
export function noteToText(stored: unknown): string {
  if (typeof stored !== "string") return ""
  const html = decodeNoteHtml(stored)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
  const text = new DOMParser().parseFromString(html, "text/html").body.textContent ?? ""
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Plain text → what DocuSoft stores: a <p> with <br> line breaks (HTML-escaped), base64-encoded. */
export function textToNote(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return toBase64(`<p>${escaped.replace(/\r?\n/g, "<br>")}</p>`)
}
