"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Link as LinkIcon, Unlink, Check, X, Pencil } from "lucide-react";
import Link from "next/link";

type LinkedAccount = {
  id: string;
  providerId: string;
  accountId?: string;
};

export default function AccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending, refetch } = useSession();
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

  const fetchAccounts = useCallback(async (setLoading = false) => {
    if (setLoading) {
      setIsLoadingAccounts(true);
    }
    try {
      const accounts = await authClient.listAccounts();
      if (accounts.data) {
        setLinkedAccounts(accounts.data as LinkedAccount[]);
      }
    } catch {
      console.error("Failed to fetch linked accounts");
    } finally {
      if (setLoading) {
        setIsLoadingAccounts(false);
      }
    }
  }, []);

  useEffect(() => {
    if (session?.user) {
      fetchAccounts(true);
    }
  }, [fetchAccounts, session?.user]);

  useEffect(() => {
    setName(session?.user?.name ?? "");
  }, [session?.user?.name]);

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={returnTo}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Account Settings</h1>
              <p className="text-sm text-muted-foreground">
                Manage your profile and linked accounts
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-2xl space-y-8">
        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
            <X className="w-4 h-4" />
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 rounded-md bg-green-500/10 text-green-500 text-sm flex items-center gap-2">
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
      </main>
    </div>
  );
}
