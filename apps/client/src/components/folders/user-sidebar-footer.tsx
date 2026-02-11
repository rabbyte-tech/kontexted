import { ChevronsUpDown } from "lucide-react"
import type { JSX } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

/**
 * Props for the UserSidebarFooter component.
 */
interface UserSidebarFooterProps {
  user: {
    name: string | null
    email: string | null
  } | null
  isMobile: boolean
  onSignOut: () => void
}

/**
 * User sidebar footer component that displays user profile and sign-out functionality.
 * Shows user avatar with initial, name, and email in a dropdown menu with sign-out option.
 */
export function UserSidebarFooter({ user, isMobile, onSignOut }: UserSidebarFooterProps): JSX.Element | null {
  if (!user) {
    return null
  }

  const userName = user.name ?? user.email ?? "Unknown user"
  const userEmail = user.email ?? ""
  const userInitial = userName.trim().charAt(0).toUpperCase() || "U"

  return (
    <SidebarFooter className="px-4 pb-4">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                  {userInitial}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{userName}</span>
                  {userEmail ? <span className="truncate text-xs">{userEmail}</span> : null}
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
                    {userInitial}
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{userName}</span>
                    {userEmail ? <span className="truncate text-xs">{userEmail}</span> : null}
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onSignOut}>Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  )
}
