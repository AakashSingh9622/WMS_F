# DocuSoft APIs used by the Add / Edit Client page

Reference for every DocuSoft API that DocuSoft's own **Add / Edit Client** page calls, written so the same
functionality can be rebuilt later (e.g. an "Add client" screen in the WMS) without reverse-engineering it again.

- **Source analysed:** `D:\sunil kewat\docusoftpractice\account\add_client.html` (the form) and
  `D:\sunil kewat\docusoftpractice\main_js\add_client.js` (12,732 lines, all the logic), plus the helper classes in
  `docusoftpractice\js_class\` (`API_Class.js`, `AllServiceParameter.js`, `AllService.js`, `CommanCLS.js`).
- **Line numbers** (`L1234`) point into `add_client.js` unless another file is named. Parameter names were extracted
  from the code and are spelled exactly as sent; **DocuSoft's casing is inconsistent between methods**
  (`ClientId` / `ClientID` / `clientId`, `projectid` / `ProjectId`, `Postcode` / `PostCode`). Copy them as written.
- Nothing in DocuSoft was called while writing this; it documents what the page sends.

---

## Contents

1. [How every call is made](#1-how-every-call-is-made)
2. [Quick index](#2-quick-index)
3. [Client: create, read, update](#3-client-create-read-update)
4. [Addresses](#4-addresses)
5. [Folders](#5-folders)
6. [Dropdowns and configuration](#6-dropdowns-and-configuration)
7. [Custom fields (UDFs)](#7-custom-fields-udfs)
8. [Contacts](#8-contacts)
9. [Companies House (UK only)](#9-companies-house-uk-only)
10. [Notes and sticky notes](#10-notes-and-sticky-notes)
11. [Emails, documents, tasks and other calls](#11-emails-documents-tasks-and-other-calls)
12. [End-to-end flows](#12-end-to-end-flows)
13. [Gotchas to avoid when reusing these APIs](#13-gotchas-to-avoid-when-reusing-these-apis)

---

## 1. How every call is made

### Endpoint

Every API is an ASP.NET `.asmx` web method:

```
POST {BASE}/PracticeServices.asmx/{MethodName}
Content-Type: application/json; charset=utf-8
Body: a JSON object (the method's parameters)
```

| Region / site | `{BASE}` (`main_js/baseUrl.js`, key `mainUrlPractice`) |
|---|---|
| UK (`.com`) | `https://accountancy.mydocusoft.com` |
| `.net` | `https://accountancy.mydocusoft.net` |
| docusoftweb | `https://docusoftweb.com` |

The base is picked from the page's own domain (`baseUrl.js`). Example:
`POST https://accountancy.mydocusoft.com/PracticeServices.asmx/Json_AddClient`.

### Credentials

Most methods need the logged-in practice user's credentials **in the body**:

| Body key | Value | Read from `localStorage` key |
|---|---|---|
| `agrno` | agreement number, e.g. `"0003"` | `agrno` |
| `Email` | user's login email | `Email` |
| `password` | user's password, **base64-encoded** | `pass` |

The page adds them automatically when it calls with `mainBool = true`
(`AllServiceParameter.js` L6–16). In the tables below:

- **Creds: auto** = the three keys above are merged into the body.
- **Creds: manual** = the method uses *different key names* for the credentials, which the page sets itself
  (e.g. `UserEmail` or `strEmail` instead of `Email`). These are listed in the parameters.
- **Creds: none** = no credentials sent.

Other `localStorage` keys the page uses: `intUserId` (user id), `DefaultFolderID` (default folder/project id),
`UserName`, `ViewerToken`.

### Response

The `.asmx` wraps every result in `{ "d": ... }`. The page reads `d`:

- Write methods usually return the plain string **`"Success"`** (anything else = failure, often an error text).
- Read methods return a **JSON string** that must be parsed again (`JSON.parse(d)`), shaped like a .NET DataSet:
  `{ "Table": [...], "Table1": [...], ... }`.
- Some newer methods return a JSON string like `{"Status":"Success", ...}` instead of a bare `"Success"`.
- An empty string `""` means "no data".

---

## 2. Quick index

| # | Method | Group | Purpose | Creds |
|---|---|---|---|---|
| 1 | `Json_AddClient` | Client | Create a new client | auto |
| 2 | `Json_UpdateClient` | Client | Update a client's main details | auto |
| 3 | `Json_GetClientCardDetails` | Client | Load a client (details + tags + UDF definitions) | auto |
| 4 | `Json_UpdateClientField` | Client | Update one field / UDF of a client | auto |
| 5 | `Json_UpdateClientExtraField` | Client | Save bank and accountant emails | auto |
| 6 | `Json_ChangeClientID` | Client | Rename a client's ID (OriginatorNo) | auto |
| 7 | `Json_GetClientAddresses` | Address | Load the client's 3 addresses | auto |
| 8 | `Json_SetClientAddress` | Address | Save one address (Main / Billing / Registered) | auto |
| 9 | `Json_GetAddressLabels` | Address | Labels for address lines (Town, County/State, Postcode/Zip…) | auto |
| 10 | `Json_GetFolders` | Folder | List all folders (projects) | auto |
| 11 | `Json_GetClientAssignedUnassignedFolderList` | Folder | Folders assigned / not assigned to a client | manual |
| 12 | `Json_AssignProjectsToClient` | Folder | Set the folders a client belongs to | auto |
| 13 | `Json_GetConfiguration` | Dropdowns | Status, Business, Source, Users, Roles lists | auto |
| 14 | `Json_GetForwardUserList` | Dropdowns | Users of a folder | auto |
| 15 | `Json_GetUserTheme` | Dropdowns | The user's UI theme | auto |
| 16 | `Json_CRMSaveUDFValues` | UDF | Save many UDF values at once | auto |
| 17 | `Json_GetLinkedUdfByProcessUdf` | UDF | UDFs linked to a "process" UDF | auto |
| 18 | `Json_GetUdfValueByLinkedUdf` | UDF | Calculated value of a linked UDF | auto |
| 19 | `Json_GetCRMContactUDFValues` | UDF | A contact's UDF values | auto |
| 20 | `Json_InsertContact` | Contact | Add a contact to a client | manual |
| 21 | `Json_UpdateContactField` | Contact | Update one field of a contact | auto |
| 22 | `Json_GetAllContacts` | Contact | List all contacts | auto |
| 23 | `Json_GetPortalContactDetails` | Contact | A contact's portal access details | manual |
| 24 | `Json_GetContactVerify` | Contact | Identity (AML) verification status | auto |
| 25 | `Json_CheckDsPubUserContact` | Contact | Find an existing contact matching a Companies House officer | auto |
| 26 | `Json_CompanyHouseDetails` | Companies House | Search / fetch UK company data | none / auto |
| 27 | `Json_GetCompnayDocument` | Companies House | Get a filed company document | auto |
| 28 | `Json_DownloadCompnayDocument` | Companies House | Download a filed company document | auto |
| 29 | `Json_Get_All_DS_Notes` | Notes | List a client's notes | auto |
| 30 | `Json_Get_DS_NotesById` | Notes | One note | auto |
| 31 | `Json_DS_NotesAdd` | Notes | Create a note (title + colour) | auto |
| 32 | `Json_DS_UpdateNotesDetail` | Notes | Rename / recolour a note | auto |
| 33 | `Json_DS_NotesSave` | Notes | Save a note's text | auto |
| 34 | `Json_DS_NotesDelete` | Notes | Delete a note | auto |
| 35 | `Json_GetStickyNotes` | Notes | Read the client's sticky note | auto |
| 36 | `Json_SetStickyNotes` | Notes | Save the client's sticky note | auto |
| 37 | `Json_GetSupplierEmail` | Email | Extra email addresses of a client | auto |
| 38 | `Json_deleteSupplierContact` | Email | Remove one of those emails | auto |
| 39 | `Json_GetDsMailInfo` | Email | Mail info for an email address | auto |
| 40 | `Json_ExplorerSearchDoc` | Documents | Documents filed for the client | auto |
| 41 | `Json_getViewerToken` | Documents | Token for the document viewer | auto |
| 42 | `Json_Get_DS_NewTaskManagerData` | Tasks | The client's tasks | auto |
| 43 | `Json_AddSupplierActivity` | Activity | Write an activity-log entry for the client | auto |
| 44 | `Json_Get_CRM_Task_ActivityByTaskId` | Activity | Activity of a task (call is commented out) | auto |

---

## 3. Client: create, read, update

### 3.1 `Json_AddClient` — create a client

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_AddClient`
- **Used by:** Submit button (`.btnClientDetailsSave`) in **add mode** → `setAndUpdateClientDetails()` (L11510; call at L11679).
- **Creds:** auto

| Parameter | Source on the form | Notes |
|---|---|---|
| `ProjectIdList` | ticked folders in `#getFolderList` | comma-separated folder ids; falls back to `localStorage.DefaultFolderID` |
| `OriginatorNo` | `#txtClientId` | the client ID — **required** |
| `OriginatorName` | `#txtCName` | client name — **required** |
| `Address` | `#FullAdd` | full address as one text block |
| `TelNo` | `#txtTeliphone` | |
| `AlteTelNo` | `#alttxtMobileNo` | note the spelling `Alte…` |
| `Faxno` | — | always `""` |
| `ContactName` | — | always `""` |
| `OrgActive` | `#InActive` / `#Hide` switches | `"Yes"` active, `"No"` inactive, `"HID"` hidden |
| `UDF1`, `UDF2`, `UDF3` | — | always `""` |
| `StickyNote` | — | always `""` |
| `ContactEmail` | `#txtCompanyEmail` | company email |
| `MParameter` | — | always `""` |
| `CDate` | today | creation date |
| `BussId` | `#otpBusiness` | the selected option's `name` attribute |
| `SourceId` | `#otpSourceName` | `.val()` |
| `StatusId` | `#otpStatusName` | the selected option's `name` attribute |
| `Description` | | |
| `OrgPassword` | | |
| `ManagerId` | `#otpUserName` | user id — **required** (a manager must be chosen) |

- **Response:** JSON string; `JSON.parse(d).Status === "Success"` means created. Any other reply is shown as
  "Reference ID Already Exists" (L11832) — this is how a duplicate client ID is detected (there is no separate check).
- **After success** the page goes on to save UDFs, the Companies House number, the 3 addresses and the main contact —
  see [flow 12.1](#121-add-a-client).
- A second copy of this call at L11118 is in a dead function (`setAndUpdateClientDetailsForServiceReqired`) and is never run.

### 3.2 `Json_UpdateClient` — update a client

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_UpdateClient`
- **Used by:** Submit button in **edit mode** → `UpdateClientDetails()` (L10649; call at L10735).
- **Creds:** auto

| Parameter | Notes |
|---|---|
| `OriginatorNo` | client ID |
| `OriginatorName` | |
| `Address` | full address text |
| `TelNo`, `AlteTelNo` | |
| `Faxno`, `ContactName` | `""` |
| `OrgActive` | `"Yes"` / `"No"` / `"HID"` |
| `StickyNote` | **always sent as `""`** (see gotchas) |
| `ContactEmail` | **always sent as `""`**; the email is saved separately with `Json_UpdateClientField` |
| `BussId`, `SourceId`, `StatusId` | option `name` attributes |
| `Description`, `OrgPassword` | |
| `ManagerId` | required |
| `CCode` | sent back exactly as `Json_GetClientCardDetails` returned it |

- **Response:** `"Success"`.
- Differences from add: no `ProjectIdList`, `CDate`, `UDF1–3`, `MParameter`; adds `CCode`.

### 3.3 `Json_GetClientCardDetails` — load a client

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_GetClientCardDetails`
- **Used by:** edit mode on page load (L2331; a near-identical duplicate at L2408).
- **Creds:** auto

| Parameter | Notes |
|---|---|
| `intProjectId` | folder id (selected folder, else URL `ProjectId`, else `DefaultFolderID`) |
| `strOrignatorNumber` | client ID (`OriginatorNo` from the URL); note the spelling `Orignator` |

- **Response** (`JSON.parse(d)`):
  - `Table` — tags
  - `Table1` — the client: `OriginatorNo, OriginatorName, BussName, BussID, CCode, StatusName, SourceName, UserName,
    TelNo, AltTelNo, Email, BankEmail, AccountantEmail, OrgPassword, Description, OrgActive, CompanyNo`
  - `Table3` — the folder's UDF (custom field) definitions and values

### 3.4 `Json_UpdateClientField` — update one client field

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_UpdateClientField`
- **Used by:** saving one UDF when it changes in edit mode (L5936, L5970 via `CommanCLS` L1506); saving the
  company email and the Companies House number after add/update (`UpdateEmailid`, `UpdateandAddClientField`, L12233, L12250).
- **Creds:** auto

| Parameter | Notes |
|---|---|
| `projectid` | folder id (lowercase key) |
| `ClientId` | client ID |
| `fieldName` | the field / UDF name, e.g. the email field or the Companies House number field |
| `fieldValue` | new value (dates are sent as `yyyy-mm-dd`) |

- **Response:** `"Success"`.

### 3.5 `Json_UpdateClientExtraField` — bank and accountant emails

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_UpdateClientExtraField`
- **Used by:** edit mode, after `Json_UpdateClient` (L5024). **Not called when adding.**
- **Creds:** auto
- **Parameters:** `BankEmail`, `AccountantEmail`, `ClientId`
- **Response:** only logged.

### 3.6 `Json_ChangeClientID` — rename a client ID

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_ChangeClientID`
- **Used by:** edit mode when the ID field was changed; asks the user to confirm first (L5867).
- **Creds:** auto
- **Parameters:** `oldID`, `NewId`, `ClientName`
- **Response:** `"Success"` → the page reloads itself with the new ID.

---

## 4. Addresses

A client has three addresses, identified by `AddressId`: **1 = Main**, **2 = Billing**, **3 = Registered**.
The "Full Address" tab is a separate free-text field sent as `Address` in `Json_AddClient` / `Json_UpdateClient`.

### 4.1 `Json_GetClientAddresses`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_GetClientAddresses`
- **Used by:** edit mode load, `callAddress` (L7840).
- **Creds:** auto
- **Parameters:** `clientId` (lowercase `c`)
- **Response:** rows with `AddressId` (1/2/3) and the address lines.

### 4.2 `Json_SetClientAddress`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_SetClientAddress`
- **Used by:** after add and after update, called **three times** in a row (Main, Billing, Registered) (L10557).
- **Creds:** auto

| Parameter | Form fields (Main / Billing / Registered) |
|---|---|
| `OriginatorNo` | client ID |
| `AddressId` | `1` / `2` / `3` |
| `AddressType` | Main / Billing / Registered |
| `Add1`, `Add2`, `Add3` | `#Madd1–3` / `#Badd1–3` / `#Radd1–3` |
| `Town` | `#MTown` / `#BTown` / `#RTown` |
| `County` | `#MCounty` / `#BCounty` / `#RCounty` (County in the UK, State in the US) |
| `Postcode` | `#MPostcode` / `#BPostcode` / `#RPostcode` |
| `Country` | `#MCountry` / `#BCountry` / `#RCountry` |

- **Response:** `"Success"`. Failures are not shown to the user.

### 4.3 `Json_GetAddressLabels`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_GetAddressLabels`
- **Used by:** page load (L8021, via `CommanCLS` L8510) — fills the label of each address line (`#LineaddM1…`).
- **Creds:** auto (the page passes `{agrno, Email, password}` explicitly).
- **Response:** the label text for each line (Line 1–3, Town, County/State, Postcode/Zip, Country).

---

## 5. Folders

A "folder" is a DocuSoft project (`ProjectId` / `FolderID`). A client belongs to one or more folders; UDFs are defined
per folder.

### 5.1 `Json_GetFolders`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_GetFolders`
- **Used by:** add mode, to list the folders to tick (L8365).
- **Creds:** auto · **Parameters:** none
- **Response:** `Table` → `FolderID`, `Folder` (name).

### 5.2 `Json_GetClientAssignedUnassignedFolderList`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_GetClientAssignedUnassignedFolderList`
- **Used by:** edit mode, to show which folders the client is in (L8482).
- **Creds:** manual — different key names:

| Parameter | Value |
|---|---|
| `agrno` | agreement number |
| `UserEmail` | login email (**not** `Email`) |
| `password` | base64 password |
| `strOrignatorno` | client ID |
| `intuserId` | `localStorage.intUserId` |

- **Response:** `Table` = assigned folders, `Table1` = unassigned folders; each row `ProjectId`, `ProjectName`.

### 5.3 `Json_AssignProjectsToClient`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_AssignProjectsToClient`
- **Used by:** "Assign / Unassign Folder(s)" button (L8738) and after update (L5049).
- **Creds:** auto
- **Parameters:** `OriginatorNo`, `ProjectIdList` (comma-separated folder ids — the full new list)
- **Response:** inconsistent in the page: L5054 checks `d === "Success"`, L8744 checks `JSON.parse(d).Status`.
  Handle both when reusing.

---

## 6. Dropdowns and configuration

### 6.1 `Json_GetConfiguration`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_GetConfiguration`
- **Used by:** page load, fills the Company Details dropdowns (L8124).
- **Creds:** auto · **Parameters:** none
- **Response:**

| Table | Dropdown | Fields |
|---|---|---|
| `Table` | Status (`#otpStatusName`) | `StatusName`, `StatusId` |
| `Table1` | Business (`#otpBusiness`) | `BussName`, `BussId` |
| `Table2` | Source (`#otpSourceName`) | source name / id |
| `Table3` | Manager (`#otpUserName`) | users, `UserId` |
| `Table4` | Roles (contact role) | roles |

### 6.2 `Json_GetForwardUserList`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_GetForwardUserList`
- **Used by:** page load (L860, wrapper `Json_GetForwardUserListUDFList` in `CommanCLS` L1991).
- **Creds:** auto · **Parameters:** `ProjectId`, `SectionId` (`"-1"` = all)
- **Response:** users of that folder (used for user-type UDFs).

### 6.3 `Json_GetUserTheme`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_GetUserTheme`
- **Used by:** page load (L846, `CommanCLS` L2412). **Creds:** auto · **Parameters:** none
- **Response:** the user's theme (UI only).

---

## 7. Custom fields (UDFs)

### 7.1 `Json_CRMSaveUDFValues` — save several UDFs at once

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_CRMSaveUDFValues`
- **Used by:** add mode, after `Json_AddClient`, once **per folder** (L11317; also L5136).
- **Creds:** auto

| Parameter | Notes |
|---|---|
| `OriginatorNo` | client ID |
| `ProjectId` | folder the UDFs belong to |
| `ClientUDFString` | `"udfId:value,udfId:value,…"` |
| `ContactUDFString` | `""` (contact UDFs not used here) |
| `ContactNo` | `""` |

- **Response:** JSON string; `.Status` checked.
- In **edit** mode UDFs are not saved by Submit; each one is saved on change with `Json_UpdateClientField`.

### 7.2 `Json_GetLinkedUdfByProcessUdf`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_GetLinkedUdfByProcessUdf`
- **Used by:** rendering UDFs (L4839, `CommanCLS` L501).
- **Creds:** auto · **Parameters:** `ProcessUdfid`, `projectid`
- **Response:** the UDFs whose value is derived from this "process" UDF.

### 7.3 `Json_GetUdfValueByLinkedUdf`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_GetUdfValueByLinkedUdf`
- **Used by:** when a date UDF changes, to recalculate linked UDFs (L6148, L9170).
- **Creds:** auto · **Parameters:** `LinkedUdfId`, `LinkedDateValue`, `projectid`
- **Response:** the calculated value (read from the `""` key of the parsed result).

### 7.4 `Json_GetCRMContactUDFValues`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_GetCRMContactUDFValues`
- **Used by:** contact section (L1309). **Creds:** auto
- **Parameters:** `ProjectId`, `ClientId`, `ContactId`
- **Response:** `Table` = contact UDF tabs, `Table1` = values.

---

## 8. Contacts

### 8.1 `Json_InsertContact` — add a contact

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_InsertContact`
- **Used by:** add mode, after `Json_AddClient`, to create the **main contact** (`addNewContactMainfun`, L10019);
  also when adding a Companies House officer as a contact (L7587).
- **Creds:** manual — the login email goes in **`strEmail`**; `email` is the *contact's* email.

| Parameter | Notes |
|---|---|
| `agrno`, `strEmail`, `password` | credentials (login email in `strEmail`) |
| `accid` | |
| `CCode` | client code |
| `Salutation`, `FirstName`, `LastName`, `greeting` | |
| `email` | the contact's email |
| `Tel`, `Mobile` | |
| `Add1`, `Add2`, `Add3`, `Town`, `PostCode`, `Country` | note `PostCode` (capital C) here |
| `ManagerName`, `AssignedManager` | |
| `Role` | from `Json_GetConfiguration` Table4 |
| `note` | |
| `CActive` | active flag |
| `maincontact` | true for the client's main contact |

- **Response:** JSON string with `.Status` and `.ContactNo` (the new contact's number).

### 8.2 `Json_UpdateContactField` — update one contact field

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_UpdateContactField`
- **Used by:** right after `Json_InsertContact` (after a fixed 2 s wait) to save the contact's **photo**
  (`fieldName: "imgPath"`, base64 image, L10125) and **State** (`fieldName: "State"`, L10152).
- **Creds:** auto
- **Parameters:** `ClientId`, `projectid`, `ContactNo`, `fieldName`, `fieldValue`
- **Response:** `"Success"`.
- ⚠️ `CommanCLS.js` L4347 calls it as `"Json_UpdateContactField "` **with a trailing space** in the method name.
  Use the name without the space.

### 8.3 `Json_GetAllContacts`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_GetAllContacts`
- **Used by:** fills the "Contact List" dropdown `#otpAllcontacts` (L5426, `CommanCLS` L4137).
- **Creds:** auto · **Parameters:** none · **Response:** all contacts.

### 8.4 `Json_GetPortalContactDetails`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_GetPortalContactDetails`
- **Used by:** contact section (L5662). **Creds:** manual
- **Parameters:** `agrno`, `UserName` (login email), `password`, `EmailId` (contact's email), `CCode`
- **Response:** `Table` = the contact's client-portal access details.

### 8.5 `Json_GetContactVerify`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_GetContactVerify`
- **Used by:** "Identity Verification Status" panel (L1653). **Creds:** auto
- **Parameters:** `Contactemail`
- **Response:** `Table` = verification (AML) status; shows the verified badge.

### 8.6 `Json_CheckDsPubUserContact`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_CheckDsPubUserContact`
- **Used by:** Companies House officers list — checks if an officer already exists as a contact (L7504).
- **Creds:** auto · **Parameters:** `FirstName`, `LastName`, `strCcode`
- **Response:** matching contact data, or `""`.

---

## 9. Companies House (UK only)

Shown only on the UK site (the CH Number field `#showCompanyhouseforUKF`).

### 9.1 `Json_CompanyHouseDetails`

- **Endpoint:** `POST {BASE}/PracticeServices.asmx/Json_CompanyHouseDetails`
- **Used by:** the "U.K. Companies House Search" modal — search as you type (L8856), fetch the chosen company
  (L9066), and a credentialed call at L7140.
- **Creds:** none (search / fetch) or auto (L7140)
- **Parameters:** `CompanyName_Number` — a company name or a company number
- **Response:**
  - `CompanyBasicDetails[]` — search results: `company_number`, `title`, `date_of_creation`
  - `CompanyDetails` — the selected company (name, registered address, …) used to fill the form
  - `ContactDetails` — officers / directors (can be added as contacts)
- The chosen company number is saved with `Json_UpdateClientField` after the client is saved.

### 9.2 `Json_GetCompnayDocument` / `Json_DownloadCompnayDocument`

- **Endpoints:** `POST {BASE}/PracticeServices.asmx/Json_GetCompnayDocument`,
  `POST {BASE}/PracticeServices.asmx/Json_DownloadCompnayDocument` (spelling `Compnay` is DocuSoft's)
- **Used by:** importing a filed Companies House document (L7327, L7349).
- **Creds:** auto · **Parameters:** `strUrl` (the document's Companies House URL)
- ⚠️ In this page the code around these calls is broken (undefined variables) — treat as not working here.

---

## 10. Notes and sticky notes

| Method | Endpoint | Parameters | Purpose | Line |
|---|---|---|---|---|
| `Json_Get_All_DS_Notes` | `…/Json_Get_All_DS_Notes` | `OriginatorNo` | list the client's notes | L6625 |
| `Json_Get_DS_NotesById` | `…/Json_Get_DS_NotesById` | `NoteId`, `OriginatorNo` | one note with its text | L6699 |
| `Json_DS_NotesAdd` | `…/Json_DS_NotesAdd` | `NoteName`, `NoteColor`, `OriginatorNo` | create a note | L6791 |
| `Json_DS_UpdateNotesDetail` | `…/Json_DS_UpdateNotesDetail` | `NoteName`, `NoteColor`, `OriginatorNo`, `NoteId` | rename / recolour | L6825 |
| `Json_DS_NotesSave` | `…/Json_DS_NotesSave` | `OriginatorNo`, `NoteId`, `Notes` | save the note's text (HTML) | L6876 |
| `Json_DS_NotesDelete` | `…/Json_DS_NotesDelete` | `NoteId`, `OriginatorNo` | delete a note | L6759 |
| `Json_GetStickyNotes` | `…/Json_GetStickyNotes` | `OriginatorNo` | read the sticky note | L6943 |
| `Json_SetStickyNotes` | `…/Json_SetStickyNotes` | `OriginatorNo`, `strStickyNotes` | save the sticky note | L6918 |

All: `POST {BASE}/PracticeServices.asmx/{Method}`, creds auto, write methods return `"Success"`.

---

## 11. Emails, documents, tasks and other calls

| Method | Endpoint | Parameters | Purpose | Line |
|---|---|---|---|---|
| `Json_GetSupplierEmail` | `…/Json_GetSupplierEmail` | `OriginatorNo` | the client's extra email addresses (`#Email_list`) | L7009 |
| `Json_deleteSupplierContact` | `…/Json_deleteSupplierContact` | `ClientID`, `ContactEmail` | remove one extra email; returns `"Success"` | L6980 |
| `Json_GetDsMailInfo` | `…/Json_GetDsMailInfo` | `strEmailId` | mail information for an email address | L7063 |
| `Json_ExplorerSearchDoc` | `…/Json_ExplorerSearchDoc` | `ProjectId`, `ClientId`, `sectionId` | documents filed for the client (`Table6`) | L1012 |
| `Json_getViewerToken` | `…/Json_getViewerToken` | — | token for the document viewer; stored in `localStorage.ViewerToken` | L923 |
| `Json_Get_DS_NewTaskManagerData` | `…/Json_Get_DS_NewTaskManagerData` | `ClientId` | the client's tasks | L2006 |
| `Json_AddSupplierActivity` | `…/Json_AddSupplierActivity` | `OriginatorNo`, `Notes`, `Status: "MCO"`, `TaskId: 0`, `TaskName: ""`, `ActionReminder: ""`, `ActivityLevelID: ""`, `ItemId: ""` | activity-log entry ("what changed") after an update; wrapper `Json_AddSupplierActivityClient` in `CommanCLS` L7940 | L5996 |
| `Json_Get_CRM_Task_ActivityByTaskId` | `…/Json_Get_CRM_Task_ActivityByTaskId` | task id | activity of a task — **call commented out** | L5998 |

All: creds auto.

---

## 12. End-to-end flows

### 12.1 Add a client

URL: `add_client.html` (no `OriginatorNo` param).

1. **Page load:** `Json_GetConfiguration` (dropdowns), `Json_GetFolders` (folder list), `Json_GetAddressLabels`,
   `Json_GetForwardUserList`, `Json_GetUserTheme`.
2. Optional: Companies House search → `Json_CompanyHouseDetails` to pre-fill name and address.
3. **Submit** (`.btnClientDetailsSave`) — checks: client ID and name required, manager required.
4. `Json_AddClient` → `Status === "Success"` (else "Reference ID Already Exists").
5. For each ticked folder: `Json_CRMSaveUDFValues` (one after another).
6. `Json_UpdateClientField` — Companies House number.
7. `Json_SetClientAddress` × 3 (Main 1, Billing 2, Registered 3).
8. `Json_InsertContact` (main contact) → returns `ContactNo`.
9. After 2 s: `Json_UpdateContactField` (`State`) and `Json_UpdateContactField` (`imgPath`, photo).
10. A progress modal shows each step.

### 12.2 Edit a client

URL: `add_client.html?OriginatorNo={clientId}&ProjectId={folderId}`.

1. **Page load:** `Json_GetConfiguration`, `Json_GetClientCardDetails` (client + UDFs), `Json_GetClientAddresses`,
   `Json_GetClientAssignedUnassignedFolderList`, plus notes, sticky note, emails, documents, tasks, contacts.
2. Each UDF change → `Json_UpdateClientField` immediately (and `Json_GetUdfValueByLinkedUdf` for linked dates).
3. **Submit** — checks: manager required, every mandatory UDF filled.
4. `Json_UpdateClient` → `"Success"`.
5. `Json_UpdateClientField` (Companies House number, then company email).
6. `Json_SetClientAddress` × 3.
7. `Json_UpdateClientExtraField` (bank / accountant email), `Json_AssignProjectsToClient` (folders).
8. `Json_AddSupplierActivity` — logs what changed.
9. If the client ID was edited: confirm → `Json_ChangeClientID` → reload with the new ID.

---

## 13. Gotchas to avoid when reusing these APIs

1. **Check every response.** In this page a network error reaches the callback looking like success, and failed
   contact/UDF/address steps are still shown as done. Treat anything other than `"Success"` (or `Status: "Success"`)
   as a failure and tell the user.
2. **Duplicate IDs are only detected by `Json_AddClient` failing.** There is no "does this ID exist" call; show the
   server's reply instead of assuming it was a duplicate.
3. **Disable Submit before calling `Json_AddClient`**, not after — the page disables it only on success, so a
   double-click can create the client twice.
4. **`Json_UpdateClient` overwrites `StickyNote` and `ContactEmail` with `""`.** Save the email afterwards with
   `Json_UpdateClientField` (as the page does) and keep the sticky note on `Json_SetStickyNotes`.
5. **Bank / accountant emails are not saved on add** — call `Json_UpdateClientExtraField` after `Json_AddClient` if needed.
6. **Credential key names differ per method** (`Email` / `UserEmail` / `strEmail` / `UserName`) — see each method.
7. **Parameter casing differs per method** (`ClientId` / `ClientID` / `clientId`, `projectid` / `ProjectId`,
   `Postcode` / `PostCode`). Copy exactly.
8. **Method names must have no trailing space** (`CommanCLS.js` has `"Json_UpdateContactField "` and
   `"Json_GetContactServices "`).
9. **Don't wait fixed times** (the page waits 1–2 s between steps); chain on each response instead.
10. **Escape server data before putting it into HTML** (company titles, folder names, dropdown text) — the page does not.
11. **The password is sensitive:** this page keeps it base64-encoded in `localStorage.pass` and even puts it in URLs
    it opens. A new implementation should keep it out of URLs and logs, and ideally out of the browser.
12. **Redirect after `Json_ChangeClientID`** is hardcoded to `http://accountancy.mydocusoft.com/...` in the page —
    build it from the current base URL instead.
