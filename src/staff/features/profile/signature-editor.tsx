"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { useSaveSignature, type Signature } from "@/api/me"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { SIGNATURE_FONTS } from "@/staff/features/profile/signature-fonts"

type Kind = Signature["kind"]
const INK = "#1f2937"
const MAX_CHARS = 380_000 // the API takes up to 400k characters of image

/** A saved signature as it will look on a certificate (white paper, so it stays readable in dark mode). */
export function SignatureImage({ signature, className }: { signature: Pick<Signature, "image">; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a data URL, not a file next/image could optimise
    <img src={signature.image} alt="Signature" className={cn("max-h-20 max-w-full object-contain", className)} />
  )
}

/** Crops the empty margin around the ink and returns a PNG — signatures come out tight on the certificate. */
function trimToPng(source: HTMLCanvasElement, pad = 12): string | null {
  const ctx = source.getContext("2d")
  if (!ctx) return null
  const { width, height } = source
  const data = ctx.getImageData(0, 0, width, height).data
  let top = height,
    left = width,
    right = -1,
    bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  if (right < 0) return null // nothing drawn
  const w = right - left + 1 + pad * 2
  const h = bottom - top + 1 + pad * 2
  const scale = Math.min(1, 800 / w, 240 / h) // keeps the file small
  const out = document.createElement("canvas")
  out.width = Math.round(w * scale)
  out.height = Math.round(h * scale)
  out.getContext("2d")!.drawImage(source, left - pad, top - pad, w, h, 0, 0, out.width, out.height)
  return out.toDataURL("image/png")
}

function DrawPad({ onChange }: { onChange: (canvas: HTMLCanvasElement | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  // Real pixels for the screen's density, so the line is crisp.
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const r = c.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(r.width * dpr)
    c.height = Math.round(r.height * dpr)
  }, [])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const dpr = e.currentTarget.width / r.width
    return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <canvas
          ref={canvas}
          aria-label="Draw your signature"
          className="aspect-[3/1] w-full cursor-crosshair touch-none rounded-lg border bg-white"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            last.current = point(e)
          }}
          onPointerMove={(e) => {
            if (!last.current) return
            const ctx = e.currentTarget.getContext("2d")!
            const p = point(e)
            const dpr = e.currentTarget.width / e.currentTarget.getBoundingClientRect().width
            ctx.strokeStyle = INK
            ctx.lineWidth = 2.6 * dpr
            ctx.lineCap = "round"
            ctx.lineJoin = "round"
            ctx.beginPath()
            ctx.moveTo(last.current.x, last.current.y)
            ctx.lineTo(p.x, p.y)
            ctx.stroke()
            last.current = p
            if (!hasInk) setHasInk(true)
          }}
          onPointerUp={() => {
            last.current = null
            onChange(canvas.current)
          }}
          onPointerLeave={() => {
            if (last.current) onChange(canvas.current)
            last.current = null
          }}
        />
        {!hasInk && (
          <p className="text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center text-sm">
            Sign here with your mouse, finger or pen
          </p>
        )}
        <div className="pointer-events-none absolute inset-x-8 bottom-[22%] border-b border-dashed border-gray-300" />
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!hasInk}
        onClick={() => {
          const c = canvas.current
          c?.getContext("2d")?.clearRect(0, 0, c.width, c.height)
          setHasInk(false)
          onChange(null)
        }}
      >
        Clear
      </Button>
    </div>
  )
}

async function typedToPng(text: string, fontFamily: string): Promise<string | null> {
  const c = document.createElement("canvas")
  c.width = 1400
  c.height = 320
  const ctx = c.getContext("2d")!
  const font = `120px ${fontFamily}`
  await document.fonts.load(font, text) // the handwriting font must be ready before drawing it
  ctx.font = font
  ctx.fillStyle = INK
  ctx.textBaseline = "middle"
  ctx.fillText(text, 40, 170, c.width - 80)
  return trimToPng(c)
}

async function uploadToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a picture (PNG, JPG or WebP)")
  if (file.size > 8_000_000) throw new Error("That picture is too large — use one under 8 MB")
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error("That picture couldn't be read"))
      i.src = url
    })
    // Scaled down to signature size; PNG keeps a transparent background, a photo stays a (smaller) JPEG.
    for (const maxW of [900, 600, 400]) {
      const scale = Math.min(1, maxW / img.width, maxW / 3 / img.height)
      const c = document.createElement("canvas")
      c.width = Math.max(1, Math.round(img.width * scale))
      c.height = Math.max(1, Math.round(img.height * scale))
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height)
      const out = file.type === "image/png" ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.88)
      if (out.length <= MAX_CHARS) return out
    }
    throw new Error("That picture is too detailed — crop it to just the signature")
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Draw it, type it in a handwriting font, or upload a picture. Always saved as an image — that image goes onto the
 * certificates of destruction this person signs.
 */
export function SignatureEditor({
  onSaved,
  defaultName = "",
}: {
  onSaved?: (s: Signature) => void
  defaultName?: string
}) {
  const [kind, setKind] = useState<Kind>("drawn")
  const [drawn, setDrawn] = useState<HTMLCanvasElement | null>(null)
  const [text, setText] = useState(defaultName)
  const [fontName, setFontName] = useState<string>(SIGNATURE_FONTS[0].name)
  const [uploaded, setUploaded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = useSaveSignature()

  const ready = kind === "drawn" ? !!drawn : kind === "typed" ? !!text.trim() : !!uploaded

  async function submit() {
    setBusy(true)
    try {
      let image: string | null = null
      if (kind === "drawn" && drawn) image = trimToPng(drawn)
      if (kind === "typed") {
        const family = SIGNATURE_FONTS.find((f) => f.name === fontName)!.font.style.fontFamily
        image = await typedToPng(text.trim(), family)
      }
      if (kind === "uploaded") image = uploaded
      if (!image) throw new Error(kind === "drawn" ? "Draw your signature first" : "Nothing to save yet")
      const saved = await save.mutateAsync({
        kind,
        image,
        ...(kind === "typed" && { text: text.trim(), font: fontName }),
      })
      toast.success("Signature saved")
      onSaved?.(saved)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the signature")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
        <TabsList>
          <TabsTrigger value="drawn">Draw</TabsTrigger>
          <TabsTrigger value="typed">Type</TabsTrigger>
          <TabsTrigger value="uploaded">Upload</TabsTrigger>
        </TabsList>

        <TabsContent value="drawn" className="pt-3">
          <DrawPad onChange={setDrawn} />
        </TabsContent>

        <TabsContent value="typed" className="space-y-3 pt-3">
          <Input
            aria-label="Your name as you sign it"
            value={text}
            maxLength={60}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your name"
          />
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Handwriting">
            {SIGNATURE_FONTS.map((f) => (
              <button
                key={f.name}
                type="button"
                role="radio"
                aria-checked={fontName === f.name}
                onClick={() => setFontName(f.name)}
                className={cn(
                  "rounded-lg border bg-white px-3 py-2 text-left transition-colors",
                  fontName === f.name ? "border-[#b93c2e] ring-2 ring-[#b93c2e]/20" : "hover:border-gray-400",
                )}
              >
                <span className={cn("block truncate text-3xl leading-tight text-gray-800", f.font.className)}>
                  {text.trim() || "Your name"}
                </span>
                <span className="text-xs text-gray-500">{f.name}</span>
              </button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="uploaded" className="space-y-3 pt-3">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Picture of your signature"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                setUploaded(await uploadToDataUrl(file))
              } catch (err) {
                setUploaded(null)
                toast.error(err instanceof Error ? err.message : "That picture couldn't be used")
              }
            }}
          />
          <p className="text-muted-foreground text-xs">
            A photo or scan of your signature on white paper. A PNG with a transparent background looks best.
          </p>
          {uploaded && (
            <div className="rounded-lg border bg-white p-3">
              <SignatureImage signature={{ image: uploaded }} />
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Button type="button" onClick={submit} disabled={!ready || busy || save.isPending}>
        {busy || save.isPending ? "Saving…" : "Save signature"}
      </Button>
    </div>
  )
}
