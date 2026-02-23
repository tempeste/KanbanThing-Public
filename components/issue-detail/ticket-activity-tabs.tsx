"use client";

import { useEffect, useState } from "react";
import { Doc } from "@/convex/_generated/dataModel";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { History, MessageSquare, Send } from "lucide-react";

type ActivityTab = "comments" | "history";

type TicketActivityTabsProps = {
  commentsLoading: boolean;
  commentsList: Doc<"ticketComments">[];
  activitiesLoading: boolean;
  activitiesList: Doc<"ticketActivities">[];
  formatActorName: (actorType: string, actorId: string, actorDisplayName?: string | null) => string;
  formatActivity: (event: Doc<"ticketActivities">) => string;
  newComment: string;
  isAddingComment: boolean;
  onNewCommentChange: (value: string) => void;
  onClearNewComment: () => void;
  onAddComment: () => void | Promise<void>;
};

function RelativeTime({ timestamp }: { timestamp: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return <span>just now</span>;
  if (minutes < 60) return <span>{minutes}m ago</span>;
  if (hours < 24) return <span>{hours}h ago</span>;
  if (days < 30) return <span>{days}d ago</span>;
  return <span>{new Date(timestamp).toLocaleDateString()}</span>;
}

export function TicketActivityTabs({
  commentsLoading,
  commentsList,
  activitiesLoading,
  activitiesList,
  formatActorName,
  formatActivity,
  newComment,
  isAddingComment,
  onNewCommentChange,
  onClearNewComment,
  onAddComment,
}: TicketActivityTabsProps) {
  const [activeTab, setActiveTab] = useState<ActivityTab>("comments");

  return (
    <div>
      <div className="mb-5 flex items-center gap-0">
        <button
          onClick={() => setActiveTab("comments")}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "comments"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground/80"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Comments
          {!commentsLoading && commentsList.length > 0 && (
            <span className="ml-0.5 font-mono text-[10px] text-muted-foreground">
              {commentsList.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "history"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground/80"
          }`}
        >
          <History className="h-3.5 w-3.5" />
          History
          {!activitiesLoading && activitiesList.length > 0 && (
            <span className="ml-0.5 font-mono text-[10px] text-muted-foreground">
              {activitiesList.length}
            </span>
          )}
        </button>
      </div>

      <div className="-mt-px border-t border-border/30" />

      {activeTab === "comments" && (
        <div className="space-y-4 pt-5">
          {commentsLoading && (
            <p className="py-2 text-sm italic text-muted-foreground/60">Loading comments...</p>
          )}
          {!commentsLoading && commentsList.length === 0 && (
            <p className="py-2 text-sm italic text-muted-foreground/60">No comments yet.</p>
          )}

          {commentsList.map((comment) => (
            <div key={comment._id} className="group">
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-sm font-medium">
                  {formatActorName(comment.authorType, comment.authorId, comment.authorDisplayName)}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground/60">
                  <RelativeTime timestamp={comment.createdAt} />
                </span>
              </div>
              <div>
                <Markdown content={comment.body} className="prose-sm" />
              </div>
            </div>
          ))}

          <div className="pt-2">
            <div className="border border-border/50 bg-background/40 transition-colors focus-within:border-primary/30">
              <Textarea
                value={newComment}
                onChange={(event) => onNewCommentChange(event.target.value)}
                rows={3}
                className="resize-none border-0 bg-transparent font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="Leave a comment..."
              />
              <div className="flex items-center justify-end gap-2 px-3 pb-2.5">
                {newComment.trim() && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={onClearNewComment}
                    disabled={isAddingComment}
                  >
                    Clear
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={onAddComment}
                  disabled={!newComment.trim() || isAddingComment}
                >
                  <Send className="h-3 w-3" />
                  {isAddingComment ? "Posting..." : "Comment"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div className="pt-5">
          {activitiesLoading ? (
            <p className="py-2 text-sm italic text-muted-foreground/60">Loading history...</p>
          ) : activitiesList.length === 0 ? (
            <p className="py-2 text-sm italic text-muted-foreground/60">No activity yet.</p>
          ) : (
            <div className="space-y-0">
              {activitiesList.map((event, index) => {
                const isLast = index === activitiesList.length - 1;
                return (
                  <div key={event._id} className="relative pl-5">
                    {!isLast && (
                      <span
                        aria-hidden
                        className="absolute left-[4.5px] top-[14px] h-[calc(100%-6px)] w-px bg-border/40"
                      />
                    )}
                    <span
                      aria-hidden
                      className="absolute left-0 top-[6px] h-[10px] w-[10px] border border-border/60 bg-card"
                    />
                    <div className="pb-4">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm">
                          {formatActorName(event.actorType, event.actorId, event.actorDisplayName)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {formatActivity(event).toLowerCase()}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground/50">
                        <RelativeTime timestamp={event.createdAt} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
