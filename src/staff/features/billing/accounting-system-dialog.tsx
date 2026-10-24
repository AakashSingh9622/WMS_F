"use client"

import { SAGE_CONFIG } from "@/api/sage"
import { useAuth } from "@/auth/useAuth"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Shown instead of connecting / sending when Sage One isn't the practice's active accounting system. Only a DocuSoft
 * admin (strIsAdmin → the session's `staff_admin` role) can switch it, so only an admin is offered the way to Settings.
 */
export function AccountingSystemDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { user } = useAuth()
  const isAdmin = !!user?.roles.includes("staff_admin")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sage One is not active</DialogTitle>
          <DialogDescription>
            {isAdmin ? (
              <>
                Your active accounting system is not Sage One. Sage One must be your practice&apos;s active accounting
                system before an invoice can be generated. Go to Settings to switch your active accounting system, then
                come back and try again.
              </>
            ) : (
              <>
                You do not have sufficient permissions to change the active accounting system for this organisation.
                Please contact your administrator or Docusoft Support at{" "}
                <a href="mailto:support@docusoft.co" style={{ color: "#d42027", fontWeight: 700 }}>
                  support@docusoft.co
                </a>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{isAdmin ? "Cancel" : "Close"}</DialogClose>
          {isAdmin && (
            <Button
              nativeButton={false}
              render={<a href={SAGE_CONFIG.practiceSettingsUrl} target="_blank" rel="noreferrer" />}
              onClick={() => onOpenChange(false)}
            >
              Go to Settings
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
