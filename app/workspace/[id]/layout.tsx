import { Id } from "@/convex/_generated/dataModel";
import { WorkspaceDataProvider } from "@/components/workspace-data-provider";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspaceId = id as Id<"workspaces">;

  return (
    <WorkspaceDataProvider workspaceId={workspaceId}>
      <div className="relative flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 bg-[size:40px_40px]"
          style={{
            backgroundImage:
              "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
          }}
        />
        <WorkspaceSidebar workspaceId={workspaceId} />
        <main className="relative z-10 flex min-w-0 flex-1 flex-col overflow-y-auto">
          {children}
        </main>
      </div>
    </WorkspaceDataProvider>
  );
}
