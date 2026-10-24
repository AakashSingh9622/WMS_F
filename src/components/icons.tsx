import type { CSSProperties, HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

/**
 * Google Material Symbols (https://fonts.google.com/icons), loaded as a font in `src/app/layout.tsx`.
 * Every icon in the app comes from here — add a name to `MATERIAL_ICON_NAMES` below too, because the layout only
 * downloads the glyphs listed there.
 *
 * Icons are sized like the old SVG ones: a Tailwind `size-N` class in `className` sets the size (default 1rem).
 */
export type IconProps = Omit<HTMLAttributes<HTMLSpanElement>, "children">
export type AppIcon = (props: IconProps) => React.JSX.Element

function sizeFromClass(className?: string): string {
  const m = className?.match(/(?:^|\s)size-(\d+(?:\.\d+)?)(?=\s|$)/)
  return m ? `${Number(m[1]) / 4}rem` : "1rem"
}

function make(name: string): AppIcon {
  function Icon({ className, style, ...rest }: IconProps) {
    const merged: CSSProperties = { fontSize: sizeFromClass(className), ...style }
    return (
      <span
        aria-hidden={rest["aria-label"] ? undefined : true}
        {...rest}
        className={cn("material-symbols-rounded inline-block shrink-0 leading-none select-none", className)}
        style={merged}
      >
        {name}
      </span>
    )
  }
  Icon.displayName = `Icon(${name})`
  return Icon
}

// Names used below — keep sorted; the layout's Google Fonts URL is built from this list.
export const MATERIAL_ICON_NAMES = [
  "add_box",
  "arrow_downward",
  "arrow_forward",
  "arrow_upward",
  "assignment_turned_in",
  "calendar_clock",
  "check",
  "check_circle",
  "chevron_left",
  "chevron_right",
  "content_copy",
  "dashboard",
  "delete_forever",
  "download",
  "edit",
  "error",
  "expand_less",
  "expand_more",
  "close",
  "info",
  "inventory_2",
  "left_panel_open",
  "lock",
  "logout",
  "mail",
  "monitor",
  "more_horiz",
  "progress_activity",
  "dark_mode",
  "document_scanner",
  "light_mode",
  "person",
  "pin_drop",
  "print",
  "barcode_scanner",
  "photo_camera",
  "playlist_add_check",
  "receipt_long",
  "request_quote",
  "search",
  "search_off",
  "settings",
  "swap_vert",
  "view_column",
  "visibility",
  "visibility_off",
  "warehouse",
  "warning",
  "group",
  "gpp_maybe",
  "move_to_inbox",
  "outbox",
  "package_2",
  "unarchive",
].sort()

// Same names the screens already used (so call sites only change their import path).
export const ArrowDown = make("arrow_downward")
export const ArrowDownToLine = make("move_to_inbox")
export const ArrowRight = make("arrow_forward")
export const ArrowUp = make("arrow_upward")
export const ArrowUpDown = make("swap_vert")
export const ArrowUpFromLine = make("outbox")
export const CalendarClock = make("calendar_clock")
export const Check = make("check")
export const CheckIcon = Check
export const ChevronDownIcon = make("expand_more")
export const ChevronLeft = make("chevron_left")
export const ChevronRight = make("chevron_right")
export const ChevronRightIcon = ChevronRight
export const ChevronUpIcon = make("expand_less")
export const CircleCheckIcon = make("check_circle")
export const ClipboardCheck = make("assignment_turned_in")
export const ClipboardList = make("playlist_add_check")
export const Columns3 = make("view_column")
export const Copy = make("content_copy")
export const DocumentScanner = make("document_scanner")
export const Download = make("download")
export const Eye = make("visibility")
export const EyeOff = make("visibility_off")
export const InfoIcon = make("info")
export const LayoutDashboard = make("dashboard")
export const Loader2Icon = make("progress_activity")
export const Lock = make("lock")
export const LogOut = make("logout")
export const Mail = make("mail")
export const MapPin = make("pin_drop")
export const Monitor = make("monitor")
export const Moon = make("dark_mode")
export const MoreHorizontalIcon = make("more_horiz")
export const OctagonXIcon = make("error")
export const Package = make("package_2")
export const PackageOpen = make("unarchive")
export const PackagePlus = make("add_box")
export const PanelLeftIcon = make("left_panel_open")
export const Pencil = make("edit")
export const Printer = make("print")
export const BarcodeScanner = make("barcode_scanner")
export const Camera = make("photo_camera")
export const ScrollText = make("receipt_long")
export const Invoice = make("request_quote")
export const Search = make("search")
export const SearchOff = make("search_off")
export const Settings = make("settings")
export const ShieldAlert = make("gpp_maybe")
export const Shredder = make("delete_forever")
export const Sun = make("light_mode")
export const TriangleAlertIcon = make("warning")
export const User = make("person")
export const Users = make("group")
export const Warehouse = make("warehouse")
export const XIcon = make("close")
