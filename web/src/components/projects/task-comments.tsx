"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { MessageSquare, Pencil, Trash2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  getComments,
  createComment,
  updateComment,
  deleteComment,
} from "@/actions/comments";
import type { CommentItem } from "@/actions/comments";

type TaskCommentsProps = {
  taskId: string;
  projectId: string;
  currentUserId: string;
  initialComments: CommentItem[];
};

export function TaskComments({
  taskId,
  projectId,
  currentUserId,
  initialComments,
}: TaskCommentsProps) {
  const t = useTranslations("projects.taskDetail.comments");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [comments, setComments] = useState<CommentItem[]>(initialComments);
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleCreate() {
    if (!newComment.trim()) return;

    startTransition(async () => {
      const result = await createComment(projectId, {
        taskId,
        content: newComment.trim(),
      });
      if (result.success) {
        setNewComment("");
        const refreshed = await getComments(projectId, taskId);
        if (refreshed.success) {
          setComments(refreshed.comments);
        }
        router.refresh();
      }
    });
  }

  function handleUpdate(commentId: string) {
    if (!editContent.trim()) return;

    startTransition(async () => {
      const result = await updateComment(projectId, {
        commentId,
        content: editContent.trim(),
      });
      if (result.success) {
        setEditingId(null);
        setEditContent("");
        const refreshed = await getComments(projectId, taskId);
        if (refreshed.success) {
          setComments(refreshed.comments);
        }
        router.refresh();
      }
    });
  }

  function handleDelete(commentId: string) {
    startTransition(async () => {
      const result = await deleteComment(projectId, { commentId });
      if (result.success) {
        setDeletingId(null);
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        router.refresh();
      }
    });
  }

  function startEdit(comment: CommentItem) {
    setEditingId(comment.id);
    setEditContent(comment.content);
    setDeletingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditContent("");
  }

  function getInitials(name: string | null, email: string): string {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return email[0].toUpperCase();
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const isEdited = (comment: CommentItem) =>
    comment.createdAt !== comment.updatedAt;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t("title")}</span>
        {comments.length > 0 && (
          <span className="text-xs text-muted-foreground">
            ({comments.length})
          </span>
        )}
      </div>

      {/* Comment list */}
      {comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-2">
              {/* Avatar */}
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {getInitials(comment.author.name, comment.author.email)}
              </div>

              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium truncate">
                    {comment.author.name ||
                      comment.author.email.split("@")[0]}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(comment.createdAt)}
                  </span>
                  {isEdited(comment) && (
                    <span className="text-xs text-muted-foreground">
                      {t("edited")}
                    </span>
                  )}
                </div>

                {/* Content or edit form */}
                {editingId === comment.id ? (
                  <div className="mt-1 space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={2}
                      className="text-sm"
                      disabled={isPending}
                    />
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleUpdate(comment.id)}
                        disabled={isPending || !editContent.trim()}
                        className="h-7 text-xs"
                      >
                        {isPending ? t("editing") : tCommon("save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={cancelEdit}
                        disabled={isPending}
                        className="h-7 text-xs"
                      >
                        {tCommon("cancel")}
                      </Button>
                    </div>
                  </div>
                ) : deletingId === comment.id ? (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-destructive">
                      {t("deleteConfirm")}
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(comment.id)}
                      disabled={isPending}
                      className="h-6 text-xs px-2"
                    >
                      {isPending ? t("deleting") : tCommon("delete")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeletingId(null)}
                      disabled={isPending}
                      className="h-6 text-xs px-2"
                    >
                      {tCommon("cancel")}
                    </Button>
                  </div>
                ) : (
                  <div className="group">
                    <p className="mt-0.5 text-sm whitespace-pre-wrap break-words">
                      {comment.content}
                    </p>
                    {/* Actions for own comments */}
                    {comment.authorId === currentUserId && (
                      <div className="mt-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => startEdit(comment)}
                          className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs text-muted-foreground hover:text-primary hover:bg-muted"
                        >
                          <Pencil className="size-3" />
                          {tCommon("edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(comment.id)}
                          className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3" />
                          {tCommon("delete")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New comment form */}
      <div className="flex gap-2">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={t("placeholder")}
          rows={2}
          className="text-sm flex-1"
          disabled={isPending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleCreate();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          onClick={handleCreate}
          disabled={isPending || !newComment.trim()}
          className="self-end h-8"
        >
          {isPending && !editingId && !deletingId ? (
            t("submitting")
          ) : (
            <>
              <Send className="size-3 mr-1" />
              {t("submit")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
