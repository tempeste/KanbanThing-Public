"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Link as LinkIcon,
  Unlink,
  Check,
  X,
  Pencil,
  Plus,
  Server,
  Trash2,
  RefreshCcw,
  Copy,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
} from "lucide-react";
import Link from "next/link";
import { validateOpenClawInstanceInput } from "@/lib/openclaw-instance-validation";

type LinkedAccount = {
  id: string;
  providerId: string;
  accountId?: string;
};

type OpenClawInstance = {
  _id: Id<"openclawInstances">;
  name: string;
  url: string;
  integrationMode?: "basic" | "enhanced";
  tokenSyncStatus?: "unknown" | "token_rotation_pending" | "healthy" | "auth_failed";
  tokenRotatedAt?: number;
  tokenVerifiedAt?: number;
  tokenLastVerifyError?: string;
  createdAt: number;
  updatedAt: number;
};

function AccountPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending, refetch } = useSession();
  const { isAuthenticated } = useConvexAuth();
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [openClawName, setOpenClawName] = useState("");
  const [openClawUrl, setOpenClawUrl] = useState("");
  const [openClawToken, setOpenClawToken] = useState("");
  const [openClawIntegrationMode, setOpenClawIntegrationMode] = useState<"basic" | "enhanced">(
    "basic"
  );
  const [editingInstanceId, setEditingInstanceId] = useState<Id<"openclawInstances"> | null>(
    null
  );
  const [isSubmittingInstance, setIsSubmittingInstance] = useState(false);
  const [verifyingInstanceId, setVerifyingInstanceId] = useState<string | null>(null);
  const [regeneratingInstanceId, setRegeneratingInstanceId] = useState<string | null>(null);
  const [revealedRotatedToken, setRevealedRotatedToken] = useState<{
    instanceId: Id<"openclawInstances">;
    token: string;
  } | null>(null);
  const [copiedTokenHelperId, setCopiedTokenHelperId] = useState<string | null>(null);
  const [togglingModeInstanceId, setTogglingModeInstanceId] = useState<string | null>(null);

  const openClawInstances = (useQuery(
    api.openclawInstances.list,
    isAuthenticated ? {} : "skip"
  ) ?? []) as OpenClawInstance[];
  const createOpenClawInstance = useAction(api.openclawInstancesActions.create);
  const updateOpenClawInstance = useAction(api.openclawInstancesActions.update);
  const regenerateOpenClawInstanceToken = useAction(api.openclawInstancesActions.regenerateToken);
  const verifyOpenClawInstanceToken = useAction(api.openclawInstancesActions.verify);
  const removeOpenClawInstance = useMutation(api.openclawInstances.remove);

  const fetchAccounts = useCallback(async () => {
    try {
      const accounts = await authClient.listAccounts();
      if (accounts.data) {
        setLinkedAccounts(accounts.data as LinkedAccount[]);
      }
    } catch {
      console.error("Failed to fetch linked accounts");
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user) {
      fetchAccounts();
    }
  }, [fetchAccounts, session?.user]);

  // Sync name from session during render
  const [prevSessionName, setPrevSessionName] = useState<string | null | undefined>(undefined);
  const sessionName = session?.user?.name;
  if (sessionName !== prevSessionName) {
    setPrevSessionName(sessionName);
    setName(sessionName ?? "");
  }

  if (isPending) {
    return (
      <main className="min-h-screen p-4 md:p-6">
        <div className="kb-shell flex min-h-[calc(100vh-2rem)] items-center justify-center p-8 md:min-h-[calc(100vh-3rem)]">
          <div className="kb-label">Loading account settings...</div>
        </div>
      </main>
    );
  }

  if (!session?.user) {
    router.push("/login");
    return null;
  }

  const user = session.user;
  const currentName = user.name ?? "";
  const trimmedName = name.trim();
  const isNameDirty = trimmedName !== currentName.trim();
  const MAX_NAME_LENGTH = 64;
  const nameError =
    trimmedName.length === 0
      ? "Name cannot be empty"
      : trimmedName.length > MAX_NAME_LENGTH
        ? `Name must be ${MAX_NAME_LENGTH} characters or fewer`
        : null;

  const handleLinkAccount = async (provider: "google" | "github") => {
    setError(null);
    try {
      await authClient.linkSocial({
        provider,
        callbackURL: "/account",
      });
    } catch {
      setError("Failed to link account");
    }
  };

  const handleUnlinkAccount = async (accountId: string, providerId: string) => {
    setError(null);
    setSuccess(null);

    // Prevent unlinking if it's the only account
    if (linkedAccounts.length <= 1) {
      setError("Cannot unlink your only authentication method");
      return;
    }

    try {
      await authClient.unlinkAccount({
        providerId,
        accountId,
      });
      setLinkedAccounts(linkedAccounts.filter((a) => a.id !== accountId));
      setSuccess("Account unlinked successfully");
    } catch {
      setError("Failed to unlink account");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsChangingPassword(true);

    try {
      const result = hasCredentialAccount
        ? await authClient.changePassword({
            currentPassword,
            newPassword,
          })
        : await authClient.$fetch("/set-password", {
            method: "POST",
            body: { newPassword },
          });

      if (result.error) {
        setError(
          result.error.message ??
            (hasCredentialAccount ? "Failed to change password" : "Failed to set password")
        );
      } else {
        setSuccess(hasCredentialAccount ? "Password changed successfully" : "Password set successfully");
        setCurrentPassword("");
        setNewPassword("");
        await fetchAccounts();
      }
    } catch {
      setError(hasCredentialAccount ? "Failed to change password" : "Failed to set password");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isNameDirty) {
      setIsEditingName(false);
      return;
    }
    if (nameError) {
      setError(nameError);
      return;
    }

    setIsUpdatingName(true);
    try {
      const result = await authClient.updateUser({ name: trimmedName });
      if (result.error) {
        setError(result.error.message ?? "Failed to update name");
      } else {
        setSuccess("Name updated");
        setName(trimmedName);
        setIsEditingName(false);
        await refetch();
      }
    } catch {
      setError("Failed to update name");
    } finally {
      setIsUpdatingName(false);
    }
  };

  const hasCredentialAccount = linkedAccounts.some((a) => a.providerId === "credential");
  const googleAccount = linkedAccounts.find((a) => a.providerId === "google");
  const githubAccount = linkedAccounts.find((a) => a.providerId === "github");

  const returnToParam = searchParams.get("returnTo");
  const returnTo =
    returnToParam && returnToParam.startsWith("/") && !returnToParam.startsWith("//")
      ? returnToParam
      : "/";

  const resetOpenClawForm = () => {
    setEditingInstanceId(null);
    setOpenClawName("");
    setOpenClawUrl("");
    setOpenClawToken("");
    setOpenClawIntegrationMode("basic");
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedTokenHelperId(id);
    setTimeout(() => setCopiedTokenHelperId(null), 1500);
  };

  const handleSubmitOpenClawInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validateOpenClawInstanceInput({
      name: openClawName,
      url: openClawUrl,
      token: openClawToken,
      requireToken: editingInstanceId === null,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmittingInstance(true);
    try {
      if (editingInstanceId) {
        await updateOpenClawInstance({
          id: editingInstanceId,
          name: openClawName.trim(),
          url: openClawUrl.trim(),
          integrationMode: openClawIntegrationMode,
          ...(openClawToken.trim() ? { token: openClawToken.trim() } : {}),
        });
        setSuccess(
          openClawToken.trim()
            ? openClawIntegrationMode === "enhanced"
              ? "OpenClaw instance updated. Plugin verification is required before enhanced dispatch."
              : "OpenClaw instance updated. Basic dispatch is available after updating OpenClaw with the new token (plugin verification optional)."
            : "OpenClaw instance updated"
        );
      } else {
        await createOpenClawInstance({
          name: openClawName.trim(),
          url: openClawUrl.trim(),
          token: openClawToken.trim(),
          integrationMode: openClawIntegrationMode,
        });
        setSuccess(
          openClawIntegrationMode === "enhanced"
            ? "OpenClaw instance created in enhanced mode. Install the KanbanThing OpenClaw plugin and verify plugin capabilities before dispatch."
            : "OpenClaw instance created in basic mode. Plugin installation is optional."
        );
      }
      resetOpenClawForm();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save OpenClaw instance";
      setError(message);
    } finally {
      setIsSubmittingInstance(false);
    }
  };

  const handleEditOpenClawInstance = (instance: OpenClawInstance) => {
    setEditingInstanceId(instance._id);
    setOpenClawName(instance.name);
    setOpenClawUrl(instance.url);
    setOpenClawToken("");
    setOpenClawIntegrationMode(instance.integrationMode ?? "basic");
  };

  const handleDeleteOpenClawInstance = async (instance: OpenClawInstance) => {
    setError(null);
    setSuccess(null);
    if (!confirm(`Delete OpenClaw instance "${instance.name}"?`)) return;
    try {
      await removeOpenClawInstance({ id: instance._id });
      setSuccess("OpenClaw instance deleted");
      if (editingInstanceId === instance._id) {
        resetOpenClawForm();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete OpenClaw instance";
      setError(message);
    }
  };

  const handleVerifyOpenClawInstance = async (instance: OpenClawInstance) => {
    setError(null);
    setSuccess(null);
    setVerifyingInstanceId(instance._id);
    try {
      await verifyOpenClawInstanceToken({ id: instance._id });
      setSuccess(`Verified OpenClaw token for "${instance.name}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify OpenClaw token");
    } finally {
      setVerifyingInstanceId(null);
    }
  };

  const handleRegenerateOpenClawToken = async (instance: OpenClawInstance) => {
    setError(null);
    setSuccess(null);
    if (
      !confirm(
        `Regenerate bearer token for \"${instance.name}\"? This immediately invalidates the old token in KanbanThing and requires OpenClaw config to be updated and verified before dispatch.`
      )
    ) {
      return;
    }
    setRegeneratingInstanceId(instance._id);
    try {
      const result = await regenerateOpenClawInstanceToken({ id: instance._id });
      setRevealedRotatedToken({ instanceId: instance._id, token: result.token });
      setSuccess(
        (instance.integrationMode ?? "basic") === "enhanced"
          ? `Token regenerated for "${instance.name}". Update OpenClaw config, then click Verify Plugin before enhanced dispatching.`
          : `Token regenerated for "${instance.name}". Update OpenClaw config before dispatching. Plugin verification is optional in basic mode.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate token");
    } finally {
      setRegeneratingInstanceId(null);
    }
  };

  const handleToggleOpenClawMode = async (instance: OpenClawInstance) => {
    setError(null);
    setSuccess(null);
    const currentMode = instance.integrationMode ?? "basic";
    const newMode = currentMode === "basic" ? "enhanced" : "basic";
    setTogglingModeInstanceId(instance._id);
    try {
      await updateOpenClawInstance({ id: instance._id, integrationMode: newMode });
      setSuccess(
        newMode === "enhanced"
          ? `"${instance.name}" switched to enhanced mode. Plugin verification is required before dispatch.`
          : `"${instance.name}" switched to basic mode. Plugin verification is now optional.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update integration mode");
    } finally {
      setTogglingModeInstanceId(null);
    }
  };

  const getTokenSyncMeta = (instance: OpenClawInstance) => {
    const isEnhanced = (instance.integrationMode ?? "basic") === "enhanced";
    switch (instance.tokenSyncStatus) {
      case "healthy":
        return {
          label: isEnhanced ? "Plugin Verified" : "Plugin Verified (Optional)",
          className: "border-done/45 bg-done/10 text-done",
          Icon: ShieldCheck,
        };
      case "token_rotation_pending":
        return {
          label: isEnhanced ? "Plugin Verify Required" : "Plugin Verify Optional",
          className: "border-amber-400/40 bg-amber-500/10 text-amber-200",
          Icon: ShieldAlert,
        };
      case "auth_failed":
        return {
          label: isEnhanced ? "Plugin Verify Failed" : "Plugin Verify Failed (Optional)",
          className: "border-destructive/45 bg-destructive/10 text-destructive",
          Icon: ShieldAlert,
        };
      default:
        return {
          label: isEnhanced ? "Plugin Verify Unknown" : "Plugin Not Verified",
          className: "border-border bg-muted/20 text-muted-foreground",
          Icon: ShieldQuestion,
        };
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="kb-shell min-h-[calc(100vh-2rem)] overflow-hidden md:min-h-[calc(100vh-3rem)]">
      <header className="kb-header border-b-2 border-primary/45 sticky top-0 z-10">
        <div className="px-4 py-4 md:px-6">
          <div className="flex items-center gap-4">
            <Link href={returnTo}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <div className="kb-label">Profile Management</div>
              <h1 className="text-2xl font-semibold tracking-[0.04em]">Account Settings</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage your profile and linked accounts
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-8 p-4 md:p-6">
        {error && (
          <div className="flex items-center gap-2 border border-destructive/45 bg-destructive/15 p-3 text-sm text-destructive">
            <X className="w-4 h-4" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 border border-done/45 bg-done/10 p-3 text-sm text-done">
            <Check className="w-4 h-4" />
            {success}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleUpdateName} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Name</Label>
                {isEditingName ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-[220px] flex-1 space-y-1">
                      <Input
                        id="profile-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Your name"
                        className={nameError ? "border-destructive focus-visible:ring-destructive" : undefined}
                        autoFocus
                      />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className={nameError ? "text-destructive" : undefined}>
                          {nameError ?? " "}
                        </span>
                        <span>
                          {trimmedName.length}/{MAX_NAME_LENGTH}
                        </span>
                      </div>
                    </div>
                    {isNameDirty ? (
                      <Button type="submit" disabled={isUpdatingName || !!nameError}>
                        {isUpdatingName ? "Saving..." : "Save"}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setName(currentName);
                        setIsEditingName(false);
                      }}
                      disabled={isUpdatingName}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm">{currentName || "Not set"}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Edit name"
                      onClick={() => setIsEditingName(true)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </form>
            <div className="space-y-2">
              <Label>Email</Label>
              <p className="text-sm">{user.email}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              OpenClaw Instances
            </CardTitle>
            <CardDescription>
              Manage your personal OpenClaw gateways for ticket dispatch. Tokens are encrypted at rest.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <details className="group">
              <summary className="kb-label cursor-pointer select-none transition-colors hover:text-foreground/70">
                Configuration Guide
              </summary>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Make sure your OpenClaw agent is configured with the correct workspace directory
                and KanbanThing API key in its <code className="border border-border/60 bg-muted/40 px-1 py-0.5 text-[11px]">.env</code> file.
                <strong className="text-foreground/80"> Enhanced</strong> mode requires the KanbanThing
                OpenClaw plugin and plugin verification;
                <strong className="text-foreground/80"> Basic</strong> mode keeps the original webhook
                dispatch flow and does not require the plugin.
              </p>
            </details>

            {openClawInstances.length === 0 ? (
              <div className="flex flex-col items-center gap-2 border border-dashed border-border/60 bg-background/30 px-4 py-8 text-center">
                <Server className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">No instances configured</p>
                <p className="text-xs text-muted-foreground/70">Add your first OpenClaw gateway below.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {openClawInstances.map((instance) => {
                  const syncMeta = getTokenSyncMeta(instance);
                  const SyncIcon = syncMeta.Icon;
                  const isEnhanced = (instance.integrationMode ?? "basic") === "enhanced";
                  const accentBar =
                    instance.tokenSyncStatus === "healthy"
                      ? "bg-done"
                      : instance.tokenSyncStatus === "token_rotation_pending"
                        ? "bg-amber-400"
                        : instance.tokenSyncStatus === "auth_failed"
                          ? "bg-destructive"
                          : "bg-muted-foreground/30";
                  return (
                    <div
                      key={instance._id}
                      className="group/card relative overflow-hidden border border-border bg-background/40"
                    >
                      {/* Status accent bar */}
                      <div className={`absolute inset-y-0 left-0 w-[3px] ${accentBar}`} />

                      {/* Header zone */}
                      <div className="space-y-1.5 py-3 pl-5 pr-4">
                        <div className="flex items-center gap-2.5">
                          <h3 className="truncate text-sm font-semibold tracking-wide">
                            {instance.name}
                          </h3>
                          <button
                            type="button"
                            className="group/mode inline-flex shrink-0 cursor-pointer items-center gap-1.5 border border-border/60 bg-muted/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-primary disabled:cursor-wait disabled:opacity-50"
                            onClick={() => handleToggleOpenClawMode(instance)}
                            disabled={togglingModeInstanceId === instance._id}
                            title={`Switch to ${isEnhanced ? "basic" : "enhanced"} mode`}
                          >
                            {togglingModeInstanceId === instance._id ? (
                              <RefreshCcw className="h-2.5 w-2.5 animate-spin" />
                            ) : (
                              <RefreshCcw className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/mode:opacity-100" />
                            )}
                            {isEnhanced ? "Enhanced" : "Basic"}
                          </button>
                          <span
                            className={`inline-flex shrink-0 items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] ${syncMeta.className}`}
                          >
                            <SyncIcon className="h-3 w-3" />
                            {syncMeta.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <code className="truncate font-mono text-[11px]">{instance.url}</code>
                          <span className="text-[11px] text-border">|</span>
                          <span className="shrink-0 text-[11px]">
                            Added {new Date(instance.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* Verify error callout */}
                      {instance.tokenLastVerifyError ? (
                        <div className="mx-4 mb-2 ml-5 flex items-start gap-2 border border-destructive/25 bg-destructive/5 px-2.5 py-1.5">
                          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                          <p className="text-[11px] leading-relaxed text-destructive">
                            {instance.tokenLastVerifyError}
                          </p>
                        </div>
                      ) : null}

                      {/* Rotated token reveal */}
                      {revealedRotatedToken?.instanceId === instance._id ? (
                        <div className="mx-4 mb-2 ml-5 space-y-2 border border-amber-400/30 bg-amber-500/5 p-3">
                          <p className="text-xs text-amber-100">
                            New bearer token (shown once). Update OpenClaw config
                            {isEnhanced
                              ? ", then click Verify Plugin."
                              : ". Plugin verification is optional in basic mode."}
                          </p>
                          <code className="block overflow-x-auto bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-amber-100">
                            {revealedRotatedToken.token}
                          </code>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                copyToClipboard(
                                  revealedRotatedToken.token,
                                  `token:${instance._id}`
                                )
                              }
                            >
                              <Copy className="mr-1.5 h-3.5 w-3.5" />
                              {copiedTokenHelperId === `token:${instance._id}`
                                ? "Copied"
                                : "Copy Token"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                copyToClipboard(
                                  `NEW_OPENCLAW_TOKEN='${revealedRotatedToken.token}' perl -0777 -i -pe 's/(\"token\"\\s*:\\s*\")[^\"]+(\"\\s*[},])/$1'.$ENV{\"NEW_OPENCLAW_TOKEN\"}.'$2/ge' ~/.openclaw/openclaw.json`,
                                  `cmd:${instance._id}`
                                )
                              }
                            >
                              <Copy className="mr-1.5 h-3.5 w-3.5" />
                              {copiedTokenHelperId === `cmd:${instance._id}`
                                ? "Copied Command"
                                : "Copy Update Command"}
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {/* Actions bar */}
                      <div className="flex items-center gap-1.5 border-t border-border/50 bg-card/30 py-2 pl-5 pr-4">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleVerifyOpenClawInstance(instance)}
                          disabled={verifyingInstanceId === instance._id}
                        >
                          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                          {verifyingInstanceId === instance._id ? "Verifying..." : "Verify"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => handleRegenerateOpenClawToken(instance)}
                          disabled={regeneratingInstanceId === instance._id}
                        >
                          <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                          {regeneratingInstanceId === instance._id ? "Rotating..." : "Rotate Token"}
                        </Button>
                        <div className="ml-auto flex items-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => handleEditOpenClawInstance(instance)}
                            title="Edit instance"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDeleteOpenClawInstance(instance)}
                            title="Delete instance"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add/Edit form */}
            <form onSubmit={handleSubmitOpenClawInstance} className="space-y-4 border border-border bg-background/30 p-4">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border/60" />
                <span className="kb-label shrink-0">
                  {editingInstanceId ? "Edit Instance" : "New Instance"}
                </span>
                <div className="h-px flex-1 bg-border/60" />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="openclaw-name" className="text-xs">Name</Label>
                  <Input
                    id="openclaw-name"
                    placeholder="Work Laptop"
                    value={openClawName}
                    onChange={(e) => setOpenClawName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="openclaw-url" className="text-xs">URL</Label>
                  <Input
                    id="openclaw-url"
                    placeholder="https://openclaw.example.com"
                    value={openClawUrl}
                    onChange={(e) => setOpenClawUrl(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="openclaw-token" className="text-xs">
                    Bearer Token
                    {editingInstanceId ? (
                      <span className="ml-1 font-normal text-muted-foreground">(leave blank to keep)</span>
                    ) : null}
                  </Label>
                  <Input
                    id="openclaw-token"
                    type="password"
                    placeholder={editingInstanceId ? "Token saved" : "oc_..."}
                    value={openClawToken}
                    onChange={(e) => setOpenClawToken(e.target.value)}
                    required={!editingInstanceId}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="openclaw-mode" className="text-xs">Integration Mode</Label>
                  <select
                    id="openclaw-mode"
                    value={openClawIntegrationMode}
                    onChange={(e) =>
                      setOpenClawIntegrationMode(e.target.value as "basic" | "enhanced")
                    }
                    className="h-9 w-full border border-input bg-background px-3 text-sm"
                  >
                    <option value="basic">Basic (webhook, no plugin)</option>
                    <option value="enhanced">Enhanced (plugin required)</option>
                  </select>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {openClawIntegrationMode === "enhanced"
                  ? "Enhanced mode requires the KanbanThing OpenClaw plugin. Dispatch is blocked until plugin verification succeeds."
                  : "Basic mode uses the original webhook dispatch path. Plugin installation and verification are optional."}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button type="submit" size="sm" disabled={isSubmittingInstance}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  {isSubmittingInstance
                    ? "Saving..."
                    : editingInstanceId
                      ? "Update Instance"
                      : "Add Instance"}
                </Button>
                {editingInstanceId ? (
                  <Button type="button" variant="ghost" size="sm" onClick={resetOpenClawForm}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="w-5 h-5" />
              Linked Accounts
            </CardTitle>
            <CardDescription>
              Connect additional accounts to sign in with multiple providers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingAccounts ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (
              <>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    <div>
                      <p className="font-medium">Google</p>
                      {googleAccount && (
                        <p className="text-xs text-muted-foreground">Connected</p>
                      )}
                    </div>
                  </div>
                  {googleAccount ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnlinkAccount(googleAccount.id, "google")}
                      disabled={linkedAccounts.length <= 1}
                    >
                      <Unlink className="w-4 h-4 mr-2" />
                      Unlink
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleLinkAccount("google")}
                    >
                      <LinkIcon className="w-4 h-4 mr-2" />
                      Link
                    </Button>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    <div>
                      <p className="font-medium">GitHub</p>
                      {githubAccount && (
                        <p className="text-xs text-muted-foreground">Connected</p>
                      )}
                    </div>
                  </div>
                  {githubAccount ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnlinkAccount(githubAccount.id, "github")}
                      disabled={linkedAccounts.length <= 1}
                    >
                      <Unlink className="w-4 h-4 mr-2" />
                      Unlink
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleLinkAccount("github")}
                    >
                      <LinkIcon className="w-4 h-4 mr-2" />
                      Link
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              {hasCredentialAccount
                ? "Change your password"
                : "Add a password to sign in with email"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              {hasCredentialAccount && (
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="new-password">
                  {hasCredentialAccount ? "New Password" : "Password"}
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" disabled={isChangingPassword}>
                {isChangingPassword
                  ? "Saving..."
                  : hasCredentialAccount
                    ? "Change Password"
                    : "Set Password"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Separator />

        <div className="text-center text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">
            Back to workspaces
          </Link>
        </div>
      </div>
      </div>
    </main>
  );
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen p-4 md:p-6">
          <div className="kb-shell flex min-h-[calc(100vh-2rem)] items-center justify-center p-8 md:min-h-[calc(100vh-3rem)]">
            <div className="kb-label">Loading account settings...</div>
          </div>
        </main>
      }
    >
      <AccountPageContent />
    </Suspense>
  );
}
