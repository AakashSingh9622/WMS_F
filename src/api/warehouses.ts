import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { apiClient, parse } from "@/api/client"
import { queryKeys } from "@/api/query-keys"
import {
  aisleSchema,
  locationLookupSchema,
  rackMatchSchema,
  rackSchema,
  slotSchema,
  warehouseLayoutSchema,
  warehouseSchema,
  zoneSchema,
} from "@/api/types"
import type {
  Aisle,
  LocationLookup,
  Rack,
  RackMatch,
  Slot,
  SlotStatus,
  Warehouse,
  WarehouseLayout,
  Zone,
} from "@/api/types"

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

/** Zones, aisles and racks of a warehouse (each with capacity) in one call — the browse picker filters them locally. */
export function useWarehouseLayout(warehouseId: string) {
  return useQuery({
    queryKey: queryKeys.warehouses.layout(warehouseId),
    queryFn: async (): Promise<WarehouseLayout> =>
      parse(warehouseLayoutSchema, await apiClient.get(`/warehouses/${warehouseId}/layout`)),
    enabled: !!warehouseId,
  })
}

/** Everything that shows a warehouse's layout, its racks or a box's stored location. */
function invalidateLayout(queryClient: ReturnType<typeof useQueryClient>, warehouseId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.detail(warehouseId) }) // layout, racks too
  queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all })
  queryClient.invalidateQueries({ queryKey: ["racks"] })
  queryClient.invalidateQueries({ queryKey: ["boxes"] })
}

interface LevelInput {
  code: string
  name?: string
}

export function useCreateZone(warehouseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: LevelInput): Promise<Zone> =>
      parse(zoneSchema, await apiClient.post(`/warehouses/${warehouseId}/zones`, input)),
    onSuccess: () => invalidateLayout(queryClient, warehouseId),
  })
}

export function useUpdateZone(warehouseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<LevelInput> & { id: string }): Promise<Zone> =>
      parse(zoneSchema, await apiClient.patch(`/zones/${id}`, input)),
    onSuccess: () => invalidateLayout(queryClient, warehouseId),
  })
}

export function useDeleteZone(warehouseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/zones/${id}`)
    },
    onSuccess: () => invalidateLayout(queryClient, warehouseId),
  })
}

type AisleInput = LevelInput & { zoneId?: string | null }

export function useCreateAisle(warehouseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: AisleInput): Promise<Aisle> =>
      parse(aisleSchema, await apiClient.post(`/warehouses/${warehouseId}/aisles`, input)),
    onSuccess: () => invalidateLayout(queryClient, warehouseId),
  })
}

export function useUpdateAisle(warehouseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<AisleInput> & { id: string }): Promise<Aisle> =>
      parse(aisleSchema, await apiClient.patch(`/aisles/${id}`, input)),
    onSuccess: () => invalidateLayout(queryClient, warehouseId),
  })
}

export function useDeleteAisle(warehouseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/aisles/${id}`)
    },
    onSuccess: () => invalidateLayout(queryClient, warehouseId),
  })
}

/**
 * Find a location by typing or scanning its code: "B04-3" (shelf — the backend suggests the position that best fits
 * `needCm`), "B04-3-2" (position), a slot barcode, or "B04" (rack). A one-off lookup, so a plain function, not a query.
 */
export async function lookupLocation(
  code: string,
  opts: { needCm?: number; warehouseId?: string; rackId?: string } = {},
) {
  const params = new URLSearchParams({ code })
  if (opts.needCm) params.set("needCm", String(opts.needCm))
  if (opts.warehouseId) params.set("warehouseId", opts.warehouseId)
  if (opts.rackId) params.set("rackId", opts.rackId) // after choosing between racks with the same name / code
  return parse(locationLookupSchema, await apiClient.get(`/locations/resolve?${params}`)) as LocationLookup
}

/** Racks whose code or name contains the text (shelf numbers typed after it are ignored) — up to 8, as you type. */
export function useRackSearch(text: string) {
  const q = text.trim()
  return useQuery({
    queryKey: ["locations", "racks", q],
    queryFn: async (): Promise<RackMatch[]> =>
      parse(z.array(rackMatchSchema), await apiClient.get(`/locations/racks?q=${encodeURIComponent(q)}`)),
    enabled: q.length > 0,
    staleTime: 30_000,
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
  zoneId?: string
  aisleId?: string
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
  cellLength?: number
  lengthUnit?: "cm" | "ft"
  label?: string
  /** null = take the rack out of its zone / aisle. An aisle decides the zone. */
  zoneId?: string | null
  aisleId?: string | null
}

export function useUpdateRack() {
  const queryClient = useQueryClient()

  return useMutation({
    // undefined fields drop out of the JSON body, so only what was sent changes
    mutationFn: async ({ rackId, cellLength, lengthUnit, label, zoneId, aisleId }: UpdateRackInput): Promise<Rack> =>
      parse(rackSchema, await apiClient.patch(`/racks/${rackId}`, { cellLength, lengthUnit, label, zoneId, aisleId })),
    // a new zone / aisle also changes the stored location of the boxes in the rack
    onSuccess: (_rack, variables) => invalidateLayout(queryClient, variables.warehouseId),
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
