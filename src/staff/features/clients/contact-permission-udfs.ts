"use client"

import { useEffect, useRef } from "react"

import { useContactPermissions, useSetContactPermission } from "@/api/clientProfile"
import { useCan } from "@/auth/useAuth"
import {
  useGetContactUdfValuesQuery,
  useUpdateContactFieldMutation,
  type DocusoftContactUdfValue,
} from "@/store/docusoftApi"

/**
 * May borrow / May destroy ARE two of the contact's own DocuSoft fields (Contact UDFs) — found by their tag and label,
 * never by id (ids differ per folder): tag "Permissions", fields "Loan Documents" and "Destroy Documents" (Boolean).
 * They're read from and saved to DocuSoft (Json_GetCRMContactUDFValues / Json_UpdateContactField). Each save is also
 * copied to our own permission row of the contact, because the portal's check runs on our server, which can't read
 * DocuSoft (it holds no DocuSoft login).
 */
export const PERMISSION_UDFS = {
  tag: "Permissions",
  canLoan: "Loan Documents",
  canPurge: "Destroy Documents",
} as const
export type PermissionFlag = "canLoan" | "canPurge"

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim())
const same = (a: unknown, b: string) => s(a).toLowerCase() === b.toLowerCase()
const isOn = (v: unknown) => ["1", "true", "yes"].includes(s(v).toLowerCase())

function findField(fields: DocusoftContactUdfValue[] | undefined, flag: PermissionFlag) {
  return fields?.find((f) => same(f.TagName, PERMISSION_UDFS.tag) && same(f.Name, PERMISSION_UDFS[flag]))
}

/** The contact's May borrow / May destroy, from its DocuSoft UDFs. `missing` = the folder has no such field. */
export function useContactPermissionUdfs({
  clientId,
  projectId,
  contactNo,
  email,
}: {
  clientId: string
  projectId?: number
  contactNo: string
  /** The contact's email — our copy is kept by it; given, the copy is brought in line with what DocuSoft says. */
  email?: string
}) {
  const q = useGetContactUdfValuesQuery(
    { projectId: projectId ?? 0, clientId, contactNo },
    { skip: projectId === undefined || !contactNo },
  )
  const loan = findField(q.data?.fields, "canLoan")
  const purge = findField(q.data?.fields, "canPurge")
  const canLoan = isOn(loan?.UdfValue)
  const canPurge = isOn(purge?.UdfValue)
  useSyncPortalCopy({
    clientId,
    email,
    ready: q.isSuccess,
    values: { canLoan: loan ? canLoan : undefined, canPurge: purge ? canPurge : undefined },
  })
  return {
    isLoading: q.isLoading || (projectId === undefined && !!contactNo),
    isError: q.isError,
    error: q.error,
    canLoan,
    canPurge,
    missing: [!loan && PERMISSION_UDFS.canLoan, !purge && PERMISSION_UDFS.canPurge].filter(Boolean) as string[],
  }
}

/**
 * Whenever the UDFs are read (Contacts tab, Edit contact), our copy — which the portal falls back to when it couldn't
 * read DocuSoft at login — is brought in line with them. Once per contact and value; only for people allowed to change
 * it; quietly (a failed copy changes nothing on screen).
 */
function useSyncPortalCopy({
  clientId,
  email,
  ready,
  values,
}: {
  clientId: string
  email?: string
  ready: boolean
  values: Partial<Record<PermissionFlag, boolean>>
}) {
  const canEdit = useCan("settings.manage")
  const { data: rows, isSuccess: rowsLoaded } = useContactPermissions(clientId)
  const setPermission = useSetContactPermission(clientId)
  const done = useRef("")
  const key = email?.toLowerCase() ?? ""
  const row = rows?.find((r) => r.email === key)
  const diff: Partial<Record<PermissionFlag, boolean>> = {}
  for (const flag of ["canLoan", "canPurge"] as const) {
    const want = values[flag]
    if (want === undefined) continue
    const have = row ? row[flag] : true // no row = allowed
    if (want !== have) diff[flag] = want
  }
  const signature = `${key}:${JSON.stringify(diff)}`
  const { mutate } = setPermission
  useEffect(() => {
    if (!canEdit || !ready || !rowsLoaded || !key || Object.keys(diff).length === 0) return
    if (done.current === signature) return
    done.current = signature
    mutate({ email: key, ...diff })
    // diff is described by signature
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, ready, rowsLoaded, key, signature, mutate])
}

/**
 * Saves May borrow / May destroy: in DocuSoft first (the source), then the copy in our permission row (the portal
 * checks that one). A failed copy throws too, so the caller can warn — DocuSoft already has the value by then.
 */
export function useSaveContactPermissionUdfs(clientId: string) {
  const [updateField] = useUpdateContactFieldMutation()
  const setPermission = useSetContactPermission(clientId)
  return async ({
    projectId,
    contactNo,
    email,
    flags,
  }: {
    projectId: number
    contactNo: string
    email: string
    flags: Partial<Record<PermissionFlag, boolean>>
  }) => {
    for (const flag of ["canLoan", "canPurge"] as const) {
      const on = flags[flag]
      if (on === undefined) continue
      await updateField({
        clientId,
        projectId,
        contactNo,
        fieldName: PERMISSION_UDFS[flag],
        fieldValue: on ? "1" : "0",
      }).unwrap()
    }
    if (email) {
      try {
        await setPermission.mutateAsync({ email, ...flags })
      } catch (err) {
        throw new Error(
          `Saved in DocuSoft, but the portal's copy wasn't updated (${err instanceof Error ? err.message : "error"})`,
        )
      }
    }
  }
}
