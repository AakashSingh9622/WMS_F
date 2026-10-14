"use client"

/* eslint-disable @typescript-eslint/no-unused-vars -- marker components: <Select> only reads their props */
import * as React from "react"
import ReactSelect, { type ClassNamesConfig, type GroupBase } from "react-select"

import { cn } from "@/lib/utils"

/**
 * Searchable dropdown (react-select). It keeps the shadcn-style API every screen already uses —
 * <Select value onValueChange><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem/>…
 * — but renders ONE react-select, so you can type to filter the options. The trigger/value/items are only
 * "read" for their props (width class, id, placeholder, option values and labels); they are not rendered.
 */

interface Option {
  value: string
  label: string
  disabled?: boolean
}

function Marker(_props: { children?: React.ReactNode }) {
  return null
}

// These render nothing themselves: <Select> collects their props.
function SelectValue(_props: { placeholder?: string; getLabel?: (value: string) => string; className?: string }) {
  return null
}
function SelectTrigger(_props: {
  className?: string
  id?: string
  size?: "sm" | "default"
  children?: React.ReactNode
  "aria-label"?: string
  "aria-invalid"?: boolean | "true" | "false"
}) {
  return null
}
function SelectContent(_props: { children?: React.ReactNode; className?: string }) {
  return null
}
function SelectItem(_props: { value: string; children?: React.ReactNode; disabled?: boolean; className?: string }) {
  return null
}
function SelectGroup({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}
const SelectLabel = Marker
const SelectSeparator = Marker

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children)
  return ""
}

interface Collected {
  options: Option[]
  trigger: React.ComponentProps<typeof SelectTrigger>
  value: React.ComponentProps<typeof SelectValue>
}

function collect(children: React.ReactNode, out: Collected) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const props = child.props as Record<string, unknown> & { children?: React.ReactNode }
    if (child.type === SelectItem) {
      out.options.push({
        value: String(props.value),
        label: textOf(props.children).trim(),
        disabled: Boolean(props.disabled),
      })
    } else if (child.type === SelectTrigger) {
      out.trigger = props as Collected["trigger"]
      collect(props.children, out) // SelectValue lives inside the trigger
    } else if (child.type === SelectValue) {
      out.value = props as Collected["value"]
    } else {
      collect(props.children, out) // SelectContent, SelectGroup, fragments, …
    }
  })
}

const classNames: ClassNamesConfig<Option, false, GroupBase<Option>> = {
  control: (s) =>
    cn(
      "border-input min-h-8 w-full rounded-lg border bg-transparent text-sm transition-colors dark:bg-input/30",
      s.isFocused && "border-ring ring-ring/50 ring-3",
      s.isDisabled && "cursor-not-allowed opacity-50",
    ),
  valueContainer: () => "gap-1 py-0.5 pl-2.5",
  placeholder: () => "text-muted-foreground",
  singleValue: () => "text-foreground",
  input: () => "text-foreground",
  indicatorsContainer: () => "pr-1",
  dropdownIndicator: () => "text-muted-foreground px-1",
  clearIndicator: () => "text-muted-foreground px-1 hover:text-foreground",
  menu: () => "bg-popover text-popover-foreground z-50 mt-1 overflow-hidden rounded-lg border shadow-md",
  menuList: () => "p-1",
  option: (s) =>
    cn(
      "cursor-default rounded-md px-2 py-1.5 text-sm",
      s.isFocused && "bg-accent text-accent-foreground",
      s.isSelected && "font-medium",
      s.isDisabled && "opacity-50",
    ),
  noOptionsMessage: () => "text-muted-foreground px-2 py-3 text-sm",
}

function Select({
  value,
  onValueChange,
  disabled,
  children,
  className,
}: {
  value?: string | null
  onValueChange?: (value: string | null) => void
  disabled?: boolean
  children?: React.ReactNode
  className?: string
}) {
  const collected: Collected = { options: [], trigger: {}, value: {} }
  collect(children, collected)
  const { options, trigger, value: valueProps } = collected

  const selected =
    value != null && value !== ""
      ? (options.find((o) => o.value === value) ?? {
          // Options not loaded yet (e.g. still fetching): show the label the screen gave, else the raw value.
          value,
          label: valueProps.getLabel ? valueProps.getLabel(value) : value,
        })
      : null

  return (
    <div className={cn("w-full", trigger.className ?? "", className)}>
      <ReactSelect<Option, false>
        inputId={trigger.id}
        aria-label={trigger["aria-label"]}
        aria-invalid={trigger["aria-invalid"]}
        options={options}
        value={selected}
        onChange={(option) => onValueChange?.(option ? option.value : null)}
        isDisabled={disabled}
        isOptionDisabled={(o) => Boolean(o.disabled)}
        placeholder={valueProps.placeholder ?? "Select…"}
        noOptionsMessage={() => "No matches"}
        isSearchable
        unstyled
        classNames={classNames}
        // Default (absolute) positioning: the menu opens right under the control. "fixed" is wrong inside dialogs,
        // because their CSS transform makes fixed coordinates relative to the dialog (menu jumped to a corner).
        menuPlacement="auto"
        components={{ IndicatorSeparator: null }}
      />
    </div>
  )
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue }
