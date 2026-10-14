import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { queryKeys } from "@/api/query-keys"
import { rackSchema, slotSchema, warehouseSchema } from "@/api/types"
import type { Rack, Slot, SlotStatus, Warehouse } from "@/api/types"

export function useWarehouses() {
  return useQuery({
    queryKey: queryKeys.warehouses.all,
    queryFn: async (): Promise<Warehouse[]> => parse(z.array(warehouseSchema), await apiClient.get("/warehouses")),
  })
}

interface CreateWarehouseInput {
  code: string
  name: string
  address?: string
}

export function useCreateWarehouse() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateWarehouseInput): Promise<Warehouse> =>
      parse(warehouseSchema, await apiClient.post("/warehouses", input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

export function useWarehouse(warehouseId: string) {
  return useQuery({
    queryKey: queryKeys.warehouses.detail(warehouseId),
    queryFn: async (): Promise<Warehouse> => parse(warehouseSchema, await apiClient.get(`/warehouses/${warehouseId}`)),
    enabled: !!warehouseId,
  })
}

export function useWarehouseRacks(warehouseId: string) {
  return useQuery({
    queryKey: queryKeys.warehouses.racks(warehouseId),
    queryFn: async (): Promise<Rack[]> =>
      parse(z.array(rackSchema), await apiClient.get(`/warehouses/${warehouseId}/racks`)),
    enabled: !!warehouseId,
  })
}

interface CreateRackInput {
  warehouseId: string
  code: string
  label: string
  rows: number
  columns: number
  /** Length of ONE cell (row × column) in the unit below; the backend stores whole centimetres. */
  cellLength: number
  lengthUnit: "cm" | "ft"
}

export function useCreateRack() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ warehouseId, ...input }: CreateRackInput): Promise<Rack> =>
      parse(rackSchema, await apiClient.post(`/warehouses/${warehouseId}/racks`, input)),
    onSuccess: (_rack, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.racks(variables.warehouseId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.detail(variables.warehouseId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

interface UpdateRackInput {
  rackId: string
  warehouseId: string
  /** New length of ONE cell in the unit below; the backend stores whole centimetres and applies it to every cell. */
  cellLength: number
  lengthUnit: "cm" | "ft"
}

export function useUpdateRack() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ rackId, cellLength, lengthUnit }: UpdateRackInput): Promise<Rack> =>
      parse(rackSchema, await apiClient.patch(`/racks/${rackId}`, { cellLength, lengthUnit })),
    onSuccess: (_rack, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.racks.detail(variables.rackId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.racks.slots(variables.rackId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.racks(variables.warehouseId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.detail(variables.warehouseId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

export function useRack(rackId: string) {
  return useQuery({
    queryKey: queryKeys.racks.detail(rackId),
    queryFn: async (): Promise<Rack> => parse(rackSchema, await apiClient.get(`/racks/${rackId}`)),
    enabled: !!rackId,
  })
}

const rackRowStatsSchema = z.array(z.object({ row: z.number(), boxCount: z.number(), onOrderCount: z.number() }))
export type RackRowStats = z.infer<typeof rackRowStatsSchema>[number]

/** Boxes stored / boxes on an open order per row of a rack (one SQL aggregate on the backend). */
export function useRackRowStats(rackId: string) {
  return useQuery({
    queryKey: [...queryKeys.racks.detail(rackId), "row-stats"],
    queryFn: async (): Promise<RackRowStats[]> =>
      parse(rackRowStatsSchema, await apiClient.get(`/racks/${rackId}/rows`)),
    enabled: !!rackId,
  })
}

export function useRackSlots(rackId: string) {
  return useQuery({
    queryKey: queryKeys.racks.slots(rackId),
    queryFn: async (): Promise<Slot[]> => parse(z.array(slotSchema), await apiClient.get(`/racks/${rackId}/slots`)),
    enabled: !!rackId,
  })
}

interface UpdateSlotInput {
  slotId: string
  rackId: string
  warehouseId: string
  status?: SlotStatus
  capacity?: number
}

export function useUpdateSlot() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ slotId, status, capacity }: UpdateSlotInput): Promise<Slot> =>
      parse(slotSchema, await apiClient.patch(`/slots/${slotId}`, { status, capacity })),
    onSuccess: (_slot, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.racks.slots(variables.rackId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.racks.detail(variables.rackId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.racks(variables.warehouseId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.detail(variables.warehouseId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}
