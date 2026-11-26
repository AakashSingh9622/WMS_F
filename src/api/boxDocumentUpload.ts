import { callDocusoft, DocusoftError } from "@/store/docusoftApi"
import { todayISO } from "@/lib/formatting"

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export interface UploadTarget {
  folderId: number
  folderName: string
  sectionId: number
  sectionName: string
  /** DocuSoft client (originator) id and name the document is filed under — the box's client. */
  clientId: string
  clientName: string
  direction: "Incoming" | "Outgoing"
  description: string
  boxNumber: string
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new DocusoftError("Could not read the file"))
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.readAsDataURL(file)
  })
}

/**
 * Json_RegisterItem (files the document in DocuSoft and returns its ItemId), then Json_UpdateItemBoxNumber (ties that
 * item to the box). If the second step fails the document IS in DocuSoft but not linked to the box — the error says so,
 * with the item id, so it can be linked later instead of being uploaded twice.
 */
export async function uploadDocumentToBox(file: File, t: UploadTarget): Promise<{ itemId: number }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new DocusoftError(`${file.name} is larger than 20 MB`)
  const strb64 = await readBase64(file)
  const today = todayISO().replace(/-/g, "/") // DocuSoft wants yyyy/mm/dd

  const registered = (await callDocusoft("Json_RegisterItem", {
    sectionId: String(t.sectionId),
    deptId: "0",
    folderId: String(t.folderId),
    categoryId: "0",
    subSectionId: "0",
    retForMonth: "-1",
    deptName: "",
    folderName: t.folderName,
    originatorId: t.clientId,
    senderId: t.clientId,
    sectionName: t.sectionName,
    extDescription: "",
    docDirection: t.direction,
    description: t.description || file.name,
    priority: "",
    stickyNote: "",
    fileName: file.name,
    forActionList: "",
    forInformationList: "",
    forGroupList: "",
    uDFList: "",
    sUDFList: "",
    clientname: t.clientName,
    receiveDate: today,
    actionByDate: "1990/01/01",
    actionDate: today,
    docViewedDate: today,
    strb64,
    strtxt64: "",
    EmailMessageId: "",
  })) as { Status?: string; ItemId?: number | string } | string

  const result = typeof registered === "object" && registered ? registered : {}
  const itemId = Number(result.ItemId)
  if (String(result.Status).toLowerCase() !== "true" || !Number.isFinite(itemId) || itemId <= 0) {
    throw new DocusoftError(`DocuSoft did not accept ${file.name}`)
  }

  try {
    await callDocusoft("Json_UpdateItemBoxNumber", {
      ItemId: itemId,
      BoxNUmber: t.boxNumber,
      ProjectId: t.folderId,
    })
  } catch (err) {
    throw new DocusoftError(
      `${file.name} was uploaded to DocuSoft (item ${itemId}) but could not be linked to box ${t.boxNumber}: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    )
  }
  return { itemId }
}
