"use client";

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  MessageSquareIcon,
  PanelLeftIcon,
  PenSquareIcon,
  SearchIcon,
  TrashIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import {
  type ChatHistory,
  getChatHistoryPaginationKey,
  SidebarHistory,
} from "@/components/chat/sidebar-history";
import { SidebarProjects } from "@/components/chat/sidebar-projects";
import { SidebarUserNav } from "@/components/chat/sidebar-user-nav";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useProjectsRefresh } from "@/hooks/use-projects";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { ProjectEditDialog, type ProjectEditMode } from "./project-edit-dialog";

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
  const { setOpenMobile, toggleSidebar } = useSidebar();
  const { mutate } = useSWRConfig();
  const refreshProjects = useProjectsRefresh();
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [editMode, setEditMode] = useState<ProjectEditMode | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const dragData = event.active.data.current as
        | { kind: string; chatId?: string; projectId?: string | null }
        | undefined;
      const dropData = event.over?.data.current as
        | { kind: string; projectId?: string | null }
        | undefined;
      if (
        !(dragData && dropData) ||
        dragData.kind !== "chat" ||
        dropData.kind !== "project"
      ) {
        return;
      }
      const chatId = dragData.chatId;
      const targetProjectId = dropData.projectId ?? null;
      if (!chatId || dragData.projectId === targetProjectId) {
        return;
      }
      // Optimistic: patch SWR cache for chat history before fetch.
      const histKey = unstable_serialize(getChatHistoryPaginationKey);
      mutate(
        histKey,
        (pages: ChatHistory[] | undefined) =>
          pages?.map((p) => ({
            ...p,
            chats: p.chats.map((c) =>
              c.id === chatId ? { ...c, projectId: targetProjectId } : c
            ),
          })),
        false
      );
      try {
        const res = await fetch(`/api/chats/${chatId}/project`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId: targetProjectId }),
        });
        if (!res.ok) {
          throw new Error("Move failed");
        }
        await Promise.all([mutate(histKey), refreshProjects()]);
        toast.success(
          targetProjectId ? "Chat moved to project" : "Chat moved to Unsorted"
        );
      } catch (err) {
        // Revert by revalidating; error toast.
        mutate(histKey);
        toast.error(err instanceof Error ? err.message : "Move failed");
      }
    },
    [mutate, refreshProjects]
  );

  const handleDeleteAll = () => {
    setShowDeleteAllDialog(false);
    router.replace("/");
    mutate(unstable_serialize(getChatHistoryPaginationKey), [], {
      revalidate: false,
    });

    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history`, {
      method: "DELETE",
    });

    toast.success("All chats deleted");
  };

  const openCreateProject = () => {
    setEditMode({ kind: "create" });
    setEditorOpen(true);
  };

  return (
    <>
      <Sidebar collapsible="icon">
        <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
          <SidebarHeader className="pb-0 pt-3">
            <SidebarMenu>
              <SidebarMenuItem className="flex flex-row items-center justify-between">
                <div className="group/logo relative flex items-center justify-center">
                  <SidebarMenuButton
                    asChild
                    className="size-8 !px-0 items-center justify-center group-data-[collapsible=icon]:group-hover/logo:opacity-0"
                    tooltip="Chatbot"
                  >
                    <Link href="/" onClick={() => setOpenMobile(false)}>
                      <MessageSquareIcon className="size-4 text-sidebar-foreground/50" />
                    </Link>
                  </SidebarMenuButton>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        className="pointer-events-none absolute inset-0 size-8 opacity-0 group-data-[collapsible=icon]:pointer-events-auto group-data-[collapsible=icon]:group-hover/logo:opacity-100"
                        onClick={() => toggleSidebar()}
                      >
                        <PanelLeftIcon className="size-4" />
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent className="hidden md:block" side="right">
                      Open sidebar
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="group-data-[collapsible=icon]:hidden">
                  <SidebarTrigger className="text-sidebar-foreground/60 transition-colors duration-150 hover:text-sidebar-foreground" />
                </div>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup className="pt-1">
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className="h-8 rounded-lg border border-sidebar-border text-[13px] text-sidebar-foreground/70 transition-colors duration-150 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      onClick={() => {
                        setOpenMobile(false);
                        router.push("/");
                      }}
                      tooltip="New Chat"
                    >
                      <PenSquareIcon className="size-4" />
                      <span className="font-medium">New chat</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className="h-8 rounded-lg text-[13px] text-sidebar-foreground/70 transition-colors duration-150 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      onClick={() => {
                        setOpenMobile(false);
                        window.dispatchEvent(
                          new CustomEvent("open-search-palette")
                        );
                      }}
                      tooltip="Search chats (⌘K)"
                    >
                      <SearchIcon className="size-4" />
                      <span className="flex-1 font-medium">Search chats</span>
                      <kbd className="ml-auto hidden rounded border border-sidebar-border bg-sidebar-accent/50 px-1.5 py-0.5 font-mono text-[10px] text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden md:inline-flex">
                        ⌘K
                      </kbd>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {user && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        className="rounded-lg text-sidebar-foreground/40 transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setShowDeleteAllDialog(true)}
                        tooltip="Delete All Chats"
                      >
                        <TrashIcon className="size-4" />
                        <span className="text-[13px]">Delete all</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {user && <SidebarProjects onCreateRequest={openCreateProject} />}
            <SidebarHistory user={user} />
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border pt-2 pb-3">
            {user && <SidebarUserNav user={user} />}
          </SidebarFooter>
          <SidebarRail />
        </DndContext>
      </Sidebar>

      <ProjectEditDialog
        mode={editMode}
        onOpenChange={setEditorOpen}
        open={editorOpen}
      />

      <AlertDialog
        onOpenChange={setShowDeleteAllDialog}
        open={showDeleteAllDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete all
              your chats and remove them from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAll}>
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
