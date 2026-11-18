/** Docbox "Tipo Préstamo": how fast / by what means a loan is handled. Only physical (dispatch) and digital (digitize) orders have one. */
export type LoanType = "normal" | "urgent" | "superior" | "fax"

export const LOAN_TYPES: { value: LoanType; label: string; hint: string }[] = [
  { value: "normal", label: "Normal", hint: "Standard service." },
  { value: "urgent", label: "Urgent", hint: "Handled ahead of normal requests." },
  { value: "superior", label: "Superior", hint: "Highest priority — before urgent requests." },
  { value: "fax", label: "By fax", hint: "The client asked for the document to be faxed." },
]

/** The loan type of an order, also for older orders that only have the yes/no urgent flag. */
export function loanTypeOf(order: { loanType?: string; urgent?: boolean; type: string }): LoanType | undefined {
  if (order.type !== "dispatch" && order.type !== "digitize") return undefined
  return (order.loanType as LoanType | undefined) ?? (order.urgent ? "urgent" : "normal")
}

export const loanTypeLabel = (value?: string) => LOAN_TYPES.find((t) => t.value === value)?.label
