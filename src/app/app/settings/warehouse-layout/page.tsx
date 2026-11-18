import { redirect } from "next/navigation"

// The old list page is gone (Warehouses shows the same list and more); old links and bookmarks land there.
export default function WarehouseLayoutSettingsPage() {
  redirect("/app/warehouses")
}
