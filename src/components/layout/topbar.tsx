"use client";

import { Bell, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Topbar({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-zinc-200/60 bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6 dark:border-border">
      <div
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,hsl(var(--primary)/0.08),transparent)]"
        aria-hidden
      />
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 lg:hidden"
          aria-label="Open navigation"
          onClick={onOpenSidebar}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium text-muted-foreground">Overview</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/10 text-primary text-sm">U</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuItem>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
