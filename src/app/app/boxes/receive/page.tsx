import { requirePermission } from "@/auth/session"
import { GoodsInScreen } from "@/staff/features/scanning/goods-in-screen"

export default async function GoodsInPage() {
  await requirePermission("boxes.operate")
  return <GoodsInScreen />
}
