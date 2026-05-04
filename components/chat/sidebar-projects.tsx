"use client";

import { useDroppable } from "@dnd-kit/core";
import { ChevronDownIcon, ChevronRightIcon, FolderIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWRInfinite from "swr/infinite";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  type ProjectListItem,
  useProjects,
  useProjectsRefresh,
} from "@/hooks/use-projects";
import { partitionPinned } from "@/lib/chat/pin";
import type { Chat } from "@/lib/db/schema";
import { fetcher } from "@/lib/utils";
import { MoreHorizontalIcon } from "./icons";
import { ProjectEditDialog, type ProjectEditMode } from "./project-edit-dialog";
import {
  type ChatHistory,
  getChatHistoryPaginationKey,
} from "./sidebar-history";
import { ChatItem } from "./sidebar-history-item";

function ProjectRow({
  project,
  chats,
  isActiveChatId,
  setOpenMobile,
  onEdit,
  onDelete,
  onChatDelete,
}: {
  project: ProjectListItem;
  chats: Chat[];
  isActiveChatId: string | null;
  setOpenMobile: (open: boolean) => void;
  onEdit: (project: ProjectListItem) => void;
  onDelete: (project: ProjectListItem) => void;
  onChatDelete: (chatId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const { isOver, setNodeRef } = useDroppable({
    id: `project:${project.id}`,
    data: { kind: "project", projectId: project.id },
  });
  const dot = project.color ?? "#7C3AED";

  return (
    <div
      className={`rounded-md transition-colors ${
        isOver ? "bg-sidebar-accent/50 ring-1 ring-sidebar-accent" : ""
      }`}
      ref={setNodeRef}
    >
      <div className="flex items-center gap-1 pr-1">
        <button
          aria-label={open ? "Collapse" : "Expand"}
          className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          {open ? (
            <ChevronDownIcon className="size-3.5 shrink-0 text-sidebar-foreground/40" />
          ) : (
            <ChevronRightIcon className="size-3.5 shrink-0 text-sidebar-foreground/40" />
          )}
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: dot }}
          />
          <span className="flex-1 truncate font-medium">{project.name}</span>
          <span className="text-[11px] text-sidebar-foreground/50">
            {chats.length}
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction
              className="static size-6 rounded-md text-sidebar-foreground/40 ring-0 hover:text-sidebar-foreground"
              showOnHover={false}
            >
              <MoreHorizontalIcon />
              <span className="sr-only">More</span>
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom">
            <DropdownMenuItem onSelect={() => onEdit(project)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onDelete(project)}
              variant="destructive"
            >
              Delete project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && (
        <div className="ml-1.5 border-l border-sidebar-border/60 pl-1.5">
          {chats.length === 0 ? (
            <div className="px-2 py-1.5 text-[12px] text-sidebar-foreground/40">
              Drop a chat here
            </div>
          ) : (
            <SidebarMenu>
              {(() => {
                const { pinned, rest } = partitionPinned(chats);
                return [...pinned, ...rest].map((chat) => (
                  <ChatItem
                    chat={chat}
                    isActive={chat.id === isActiveChatId}
                    key={chat.id}
                    onDelete={onChatDelete}
                    setOpenMobile={setOpenMobile}
                  />
                ));
              })()}
            </SidebarMenu>
          )}
        </div>
      )}
    </div>
  );
}

export function SidebarProjects({
  onCreateRequest,
}: {
  onCreateRequest: () => void;
}) {
  const { setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const activeChatId = pathname?.startsWith("/chat/")
    ? (pathname.split("/")[2] ?? null)
    : null;
  const { projects, isLoading } = useProjects();
  const refreshProjects = useProjectsRefresh();
  const { data: paginatedChatHistories, mutate: mutateHistory } =
    useSWRInfinite<ChatHistory>(getChatHistoryPaginationKey, fetcher, {
      revalidateOnFocus: false,
    });
  const [editMode, setEditMode] = useState<ProjectEditMode | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProjectListItem | null>(
    null
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showChatDeleteDialog, setShowChatDeleteDialog] = useState(false);

  const chatsByProject = useMemo(() => {
    const flat = (paginatedChatHistories ?? []).flatMap((p) => p.chats);
    const map = new Map<string, Chat[]>();
    for (const chat of flat) {
      if (!chat.projectId) {
        continue;
      }
      const arr = map.get(chat.projectId) ?? [];
      arr.push(chat);
      map.set(chat.projectId, arr);
    }
    return map;
  }, [paginatedChatHistories]);

  if (isLoading) {
    return null;
  }

  const handleEdit = (project: ProjectListItem) => {
    setEditMode({ kind: "edit", project });
    setEditorOpen(true);
  };

  const handleConfirmDeleteProject = async () => {
    if (!pendingDelete) {
      return;
    }
    const { id } = pendingDelete;
    setPendingDelete(null);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Delete failed");
      }
      await Promise.all([refreshProjects(), mutateHistory()]);
      toast.success("Project deleted, chats moved to Unsorted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleChatDelete = (chatId: string) => {
    setDeleteId(chatId);
    setShowChatDeleteDialog(true);
  };

  const confirmChatDelete = () => {
    const id = deleteId;
    if (!id) {
      return;
    }
    setShowChatDeleteDialog(false);
    if (pathname === `/chat/${id}`) {
      router.replace("/");
    }
    mutateHistory((pages) =>
      pages?.map((p) => ({
        ...p,
        chats: p.chats.filter((c) => c.id !== id),
      }))
    );
    fetch(`/api/chat?id=${id}`, { method: "DELETE" });
    toast.success("Chat deleted");
  };

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <div className="flex items-center justify-between pr-1">
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">
            Projects
          </SidebarGroupLabel>
          <button
            className="rounded-md px-1.5 py-0.5 text-[11px] text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            onClick={onCreateRequest}
            type="button"
          >
            + New
          </button>
        </div>
        <SidebarGroupContent>
          {projects.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-sidebar-foreground/50">
              <FolderIcon className="size-3.5" />
              <span>No projects yet</span>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {projects.map((project) => (
                <ProjectRow
                  chats={chatsByProject.get(project.id) ?? []}
                  isActiveChatId={activeChatId}
                  key={project.id}
                  onChatDelete={handleChatDelete}
                  onDelete={(p) => setPendingDelete(p)}
                  onEdit={handleEdit}
                  project={project}
                  setOpenMobile={setOpenMobile}
                />
              ))}
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      <ProjectEditDialog
        mode={editMode}
        onOpenChange={setEditorOpen}
        open={editorOpen}
      />

      <AlertDialog
        onOpenChange={(open) => !open && setPendingDelete(null)}
        open={pendingDelete !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete project &ldquo;{pendingDelete?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Chats inside this project will be moved to Unsorted, not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteProject}>
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={setShowChatDeleteDialog}
        open={showChatDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmChatDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
