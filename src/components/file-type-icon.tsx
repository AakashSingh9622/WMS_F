import {
  FileArchiveIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
  MailIcon,
  PresentationIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

const KINDS: { match: string[]; icon: LucideIcon; color: string }[] = [
  { match: ["pdf"], icon: FileTextIcon, color: "text-red-600" },
  { match: ["doc", "docx", "rtf", "odt"], icon: FileTextIcon, color: "text-blue-600" },
  { match: ["xls", "xlsx", "xlsm", "csv", "ods"], icon: FileSpreadsheetIcon, color: "text-emerald-600" },
  { match: ["ppt", "pptx", "odp"], icon: PresentationIcon, color: "text-orange-600" },
  { match: ["jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff", "webp", "svg", "heic"], icon: ImageIcon, color: "text-purple-600" },
  { match: ["zip", "rar", "7z", "tar", "gz"], icon: FileArchiveIcon, color: "text-amber-600" },
  { match: ["msg", "eml"], icon: MailIcon, color: "text-sky-600" },
  { match: ["txt", "log", "xml", "json", "html", "htm"], icon: FileTextIcon, color: "text-slate-500" },
]

/** The file extension of a name or a bare type ("report.PDF" and "pdf" both give "pdf"). */
export function fileExtension(nameOrType: string | null | undefined): string {
  const s = (nameOrType ?? "").trim().toLowerCase()
  return s.includes(".") ? s.slice(s.lastIndexOf(".") + 1) : s
}

/** An icon for a file type — by extension ("pdf", "jpg", …) or a whole file name. Unknown types get a plain file icon. */
export function FileTypeIcon({ type, className }: { type: string | null | undefined; className?: string }) {
  const ext = fileExtension(type)
  const kind = KINDS.find((k) => k.match.includes(ext))
  const Icon = kind?.icon ?? FileIcon
  return <Icon aria-hidden className={cn("size-4 shrink-0", kind?.color ?? "text-muted-foreground", className)} />
}
