"use client"

import { useEffect, useRef, useState } from "react"

// The browser's own barcode reader (Chrome / Edge on Android, macOS, ChromeOS). Not in TypeScript's DOM types yet.
interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>
}
interface BarcodeDetectorClass {
  new (options: { formats: string[] }): BarcodeDetectorLike
  getSupportedFormats(): Promise<string[]>
}

const WANTED_FORMATS = ["code_128", "code_39", "ean_13", "qr_code"] // box labels are Code 128
const CAMERA: MediaStreamConstraints = { video: { facingMode: { ideal: "environment" } }, audio: false }

function cameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ""
  if (name === "NotAllowedError")
    return "Camera access is blocked — allow it from the icon in the address bar, then try again."
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera found on this device."
  if (name === "NotReadableError") return "The camera is in use by another app."
  return err instanceof Error ? err.message : "The camera couldn't start."
}

/**
 * Live camera preview that reads a barcode and calls `onDetected` once. Uses the browser's BarcodeDetector where it
 * reads Code 128, otherwise the zxing library (loaded only when the camera is opened, e.g. Chrome on Windows).
 * Needs https (or localhost) and camera permission; the camera stops when this unmounts.
 */
export function CameraScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const latest = useRef(onDetected)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    latest.current = onDetected
  }, [onDetected])

  useEffect(() => {
    let stop: (() => void) | undefined
    let cancelled = false
    let done = false
    const found = (code: string) => {
      if (done || cancelled) return
      done = true
      stop?.()
      latest.current(code.trim())
    }

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError("The camera only works on a secure (https) page.")
        return
      }
      const el = video.current
      if (!el) return
      try {
        const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector
        const supported = Native ? await Native.getSupportedFormats().catch(() => []) : []
        if (Native && supported.includes("code_128")) {
          const stream = await navigator.mediaDevices.getUserMedia(CAMERA)
          if (cancelled) return stream.getTracks().forEach((t) => t.stop())
          el.srcObject = stream
          await el.play()
          setReady(true)
          const detector = new Native({ formats: WANTED_FORMATS.filter((f) => supported.includes(f)) })
          const timer = setInterval(async () => {
            try {
              const [hit] = await detector.detect(el)
              if (hit?.rawValue) found(hit.rawValue)
            } catch {
              // a frame that couldn't be read — keep trying
            }
          }, 200)
          stop = () => {
            clearInterval(timer)
            stream.getTracks().forEach((t) => t.stop())
          }
        } else {
          const { BrowserMultiFormatOneDReader } = await import("@zxing/browser")
          if (cancelled) return
          const controls = await new BrowserMultiFormatOneDReader().decodeFromConstraints(CAMERA, el, (result) => {
            if (result) found(result.getText())
          })
          if (cancelled) return controls.stop()
          setReady(true)
          stop = () => controls.stop()
        }
      } catch (err) {
        if (!cancelled) setError(cameraError(err))
      }
    }

    void start()
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video ref={video} className="aspect-video w-full object-cover" muted playsInline />
        {ready && (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-[#e4572e] shadow-[0_0_12px_#e4572e]" />
        )}
        {!ready && !error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            Starting the camera…
          </p>
        )}
      </div>
      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : (
        <p className="text-muted-foreground text-xs">Hold the label steady across the red line.</p>
      )}
    </div>
  )
}
