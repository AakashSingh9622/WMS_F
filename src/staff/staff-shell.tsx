"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import {
  ClipboardList,
  LayoutDashboard,
  MapPin,
  ScrollText,
  Search,
  Settings,
  Users,
  type AppIcon,
} from "@/components/icons"

import iconImage from "@/app/icon.png"

import { useAuth } from "@/auth/useAuth"
import { staffNavItems } from "@/domain/navigation"
import { UserMenu } from "@/components/user-menu"
import { PageBreadcrumbs } from "@/components/page-breadcrumbs"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const navIcons: Record<string, AppIcon> = {
  "/app": LayoutDashboard,
  "/app/boxes": Search,
  "/app/orders": ClipboardList,
  "/app/warehouses": MapPin,
  "/app/clients": Users,
  "/app/audit": ScrollText,
  "/app/settings": Settings,
}

export function StaffShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const roles = user?.roles ?? []
  const items = staffNavItems.filter((item) => !item.roles || item.roles.some((r) => roles.includes(r)))

  return (
    <div className="side-staff">
      <SidebarProvider className="h-svh min-h-0">
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center justify-center gap-2 px-2 py-1">
              <Image
                src="/login/logo.png"
                alt="DocuSoft"
                width={300}
                height={125}
                className="h-10 w-auto group-data-[collapsible=icon]:hidden"
                priority
              />
              <Image
                src={iconImage}
                alt="DocuSoft"
                className="hidden size-8 rounded-md group-data-[collapsible=icon]:block"
                priority
              />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {items.map((item) => {
                    const isActive = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href)
                    const Icon = navIcons[item.href]
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          render={<Link href={item.href} />}
                          isActive={isActive}
                          tooltip={item.label}
                          className="text-foreground/80 h-11 gap-3 rounded-lg px-3 text-[15px] group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0! data-active:bg-[#b93c2e]/10 data-active:font-semibold data-active:text-[#b93c2e]"
                        >
                          {Icon && (
                            <Icon className="text-muted-foreground group-data-active/menu-button:text-[#b93c2e] size-6" />
                          )}
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <SidebarInset className="h-svh min-h-0 overflow-hidden">
          <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-3">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <span className="font-semibold">WMS Staff</span>
              <PageBreadcrumbs />
            </div>
            <UserMenu />
          </header>
          {/* Fixed to the screen: the top bar never scrolls away. Pages with a table fill this area (h-full) and
              scroll inside the table; other pages simply scroll here. */}
          <div className="bg-muted/30 min-h-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
