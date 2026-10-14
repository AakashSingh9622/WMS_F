"use client"

import Link from "next/link"
import { Fragment } from "react"

import { useBreadcrumbs } from "@/hooks/useBreadcrumbs"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export function PageBreadcrumbs() {
  // "WMS Staff" in the top bar already names the staff root, so skip the leading "Staff" crumb.
  const crumbs = useBreadcrumbs().filter((crumb) => crumb.href !== "/app")
  if (crumbs.length === 0) return null

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.href}>
            <BreadcrumbItem>
              {index === crumbs.length - 1 ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                // next/link = client-side navigation. A plain <a href> reloads the whole page, which wipes
                // the Redux store (picked folder, cached DocuSoft data) and re-runs every API call.
                <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.label}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {index < crumbs.length - 1 && <BreadcrumbSeparator />}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
