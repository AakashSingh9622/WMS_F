import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import type { RecordPurgeRow } from "@/domain/record-purge"

const resultSchema = z.object({
  dryRun: z.boolean(),
  /** a check: how many rows would be purged / lent */
  purgeCount: z.number().optional(),
  loanCount: z.number().optional(),
  /** the real thing */
  purged: z.number().optional(),
  lent: z.number().optional(),
  requestNumber: z.string().optional(),
  requestId: z.string().optional(),
})
export type PurgeResult = z.infer<typeof resultSchema>

export interface PurgeByFileInput {
  clientId: string
  clientName: string
  dryRun: boolean
  rows: RecordPurgeRow[]
  /** describes the one request made for the rows marked loan */
  loan?: { loanType?: string; requestChannel?: string; contactName?: string; contactEmail?: string; notes?: string }
}

/**
 * Purge and/or lend records by file. All rows are saved, or (422, `ApiError.rowErrors`) none are. `dryRun` only checks.
 * A purge is final: the record becomes "destroyed".
 */
export function usePurgeRecordsByFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: PurgeByFileInput) => parse(resultSchema, await apiClient.post("/record-purges", input)),
    onSuccess: (result) => {
      if (result.dryRun) return
      void queryClient.invalidateQueries({ queryKey: ["archive-records"] })
      void queryClient.invalidateQueries({ queryKey: ["record-requests"] })
    },
  })
}
