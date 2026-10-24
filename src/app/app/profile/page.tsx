import { redirect } from "next/navigation"

// The only profile setting today is the signature.
export default function ProfilePage() {
  redirect("/app/profile/signature")
}
