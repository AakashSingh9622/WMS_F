# Warehouse Management System — Project Overview

## 1. The 30-second explanation

We store physical boxes of documents for our clients. This system tracks every box from the moment it arrives until it
is returned or destroyed. **Staff** use a web app to register, store, find, move and ship boxes. **Clients** use a
portal to see their own boxes and to ask for them back (a loan) or ask for them to be destroyed. Everything that
happens to a box is recorded, so we can always say where it is and who did what.

## 2. The problem it solves

| Without the system | With the system |
|---|---|
| Box locations kept in spreadsheets or in people's heads | Every box has a barcode and an exact position (warehouse, rack, shelf, slot) |
| Clients phone or e-mail to ask for a box | Clients request it themselves in the portal |
| Hard to know how full a warehouse is | Live capacity per warehouse, measured in centimetres |
| No proof of who moved or destroyed a box | A full audit history and signed certificates of destruction |
| Billing and reports built by hand | Reports for archive, loans and interfiling; rate cards for pricing |

## 3. Who uses it

- **Warehouse staff (operators):** register boxes, put them away, pick and dispatch orders.
- **Managers and admins:** approve requests, manage settings (sites, box sizes, custom fields, users), read reports.
- **Auditors / finance:** read-only access to the audit log and billing.
- **Client contacts:** see only their own company's boxes. A contact can be limited to certain files and can be allowed
  or not allowed to request loans or destruction.

## 4. The three parts of the system

1. **Staff web app** (`/app`): Next.js 16, React 19, TypeScript. This is the main application.
2. **Backend API:** Node.js with Express and Prisma, on a Postgres database (Supabase).
3. **Client portal:** a separate lightweight web site (HTML and jQuery) that clients log in to.

The system also depends on **DocuSoft**, our existing platform. Staff login is checked against DocuSoft, and the list
of clients and folders comes from DocuSoft. Clients are never copied into our own database.

## 5. How the data is organised

**Where things are stored:** Site → Warehouse → Zone → Aisle → Rack → Shelf → Position.
Each position has a capacity in centimetres. A standard box takes 40 cm, a large box 80 cm, and administrators can
add more box sizes.

**What is stored:** Client → File (called an *expediente*, a client's case or folder) → Box → contents of the box.
Clients can have their own custom fields (for example "Contract number") on boxes and files.

**What happens to it:** Orders (loan, return, destruction, digitisation) and an audit event for every change.

## 6. The life of a box

1. **Register.** Staff pick the client and create the boxes. Labels with barcodes are printed. The box is *unallocated*.
2. **Store.** The system suggests positions that have enough free space. Staff confirm one and the box becomes *stored*.
3. **Find.** Staff search by code, client, file, custom field, location or status, or scan the barcode.
4. **Move.** A box can be moved to another position at any time.
5. **Loan.** A client or staff member creates an order. After approval the box is reserved, picked and sent out.
   A delivery note is printed in the format set for that file.
6. **Return.** The box comes back and is stored again.
7. **Destroy.** The client requests destruction (it needs permission), staff confirm it, and a signed certificate of
   destruction is produced. The box is closed as *destroyed*.
8. **Audit.** Each step above is logged with who, what and when. Staff get notifications for client activity.

## 7. What the client portal offers

- A dashboard with the number of boxes and their status.
- A list of the client's boxes with search by field, plus box details, history and contents.
- Creating loan and destruction requests.
- A "My details" page showing the logged-in person, the files they may see and what they are allowed to request.

Access is controlled in the backend, not only on screen. A contact limited to certain files cannot open other boxes
even by guessing a link.

## 8. Reports

- **Archive report:** boxes, containers and recorded contents per client, optionally split by file, filtered by site,
  warehouse, state and dates.
- **Loan report:** requests by type and urgency, filterable by requester, request type and loan type, optionally split
  by file.
- **Interfiling report:** which boxes hold recorded files and how many.

## 9. The staff dashboard

The first screen after login. It shows what needs attention now (orders waiting for approval, unallocated boxes,
boxes on loan, on hold or missing), quick shortcuts for the daily tasks, how full each warehouse is (fullest first)
and the latest client updates and activity. A card is shown only if the user's role can act on it.

## 10. How it works technically (short)

- The browser talks to `/api/*`. Next.js forwards those calls to the backend.
- Login returns a signed token (JWT). A route guard protects pages and each page checks the user's role.
- Long lists are paged on the server (at most 100 rows per page).
- Database changes are small, additive SQL scripts, followed by a Prisma client update.
- The web app, backend and portal live in three separate git repositories.

## 11. Current status

The system is about 95% complete against the Docbox requirements document. The remaining items are:

- Loan "listing" states (lent, cancelled, requested, returned) in the loan report.
- Confirming the "Cod" and "Akte" delivery-note layouts with the business.
- A "Combo" (dropdown) custom field type.

## 12. Known limitations and next steps

- **Security:** the DocuSoft password is kept in the browser's local storage (encoded, not encrypted). This is
  acceptable for an internal or demo tool and should be reviewed before wider use.
- **Testing:** the newest features were verified against the real database but have few automated tests, and not all
  screens have been checked by hand in the browser yet.
- **Two portals:** a Next.js portal (still on mock data) and the static portal exist side by side. One should be chosen
  as the long-term client portal.
- **Cleanup:** old mock-API code is still in the repository and can be removed.
- **Performance:** the dashboard makes several small requests. A single summary endpoint would reduce this.

## 13. Glossary

| Term | Meaning |
|---|---|
| Box | A physical container of documents with a barcode |
| Expediente | A client's file or case; boxes can belong to one |
| Site (Sede) | A group of warehouses at one place |
| Position / slot | One cell on a rack shelf where boxes are stored |
| Loan | A client temporarily gets a box back |
| Interfiling | Adding individual files into boxes already stored |
| NCE | Number of containers in the archive report |
| Audit log | The permanent record of every action |
