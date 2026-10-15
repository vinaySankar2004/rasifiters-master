"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, Reorder, useDragControls } from "framer-motion";
import { useAuth } from "@/lib/auth/auth-provider";
import { useAuthGuard } from "@/lib/hooks/use-auth-guard";
import { Select } from "@/components/Select";
import {
  createProgram,
  deleteProgram,
  fetchPrograms,
  Program,
  saveProgramOrder,
  updateMembership,
  updateProgram
} from "@/lib/api/programs";
import {
  fetchAllInvites,
  fetchMyInvites,
  PendingInvite,
  respondToInvite
} from "@/lib/api/invites";
import { formatDateRange, formatInviteDate, initials, toLocalISODate, todayLocalISO } from "@/lib/format";
import { saveActiveProgram } from "@/lib/storage";
import { PageShell } from "@/components/ui/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusBadge, programStatusVariant } from "@/components/ui/StatusBadge";
import { IconUser, IconLock, IconPalette, IconDocument, IconHelp, IconLogout, IconMail, IconSettings, IconUsers, SearchIcon } from "@/components/icons";
import { ErrorView } from "@/components/kit/ErrorView";
import { FloatingBanner } from "@/components/kit/FloatingBanner";
import { appError, toAppError, type AppError } from "@/lib/kit/app-error";
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { useOnlineStatus, useRefetchOnReconnect } from "@/lib/kit/use-online-status";
import { cachedQueryFn, useLaunchSeed } from "@/lib/cache/launch-cache";
import { useClientSearchParams } from "@/lib/use-client-search-params";
import { NOTIFICATION_COPY } from "@/lib/api/notifications";
import { markInviteItemsRead, useUnreadCount } from "@/lib/notifications/queries";
import { OPEN_INBOX_EVENT, openNotificationTarget, opensInbox } from "@/lib/notifications/targets";
import { InboxList } from "@/components/notifications/InboxList";
import { PRIVACY_POLICY_URL } from "@/lib/config";

const STATUS_OPTIONS = ["planned", "active", "completed"] as const;
const PROGRAMS_KEY = ["programs"];

export default function ProgramsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // D-C3: reuse the foundation's auth guard (built for exactly this) instead of an
  // inline redirect useEffect. requireProgram:false — this hub is WHERE you pick the
  // active program, so it must not bounce to itself. Redirects to /login if unauthed.
  const { session, token } = useAuthGuard({ requireProgram: false });
  const { signOut } = useAuth();
  const memberId = session?.user.id;
  const isGlobalAdmin = session?.user.globalRole === "global_admin";

  const [showActions, setShowActions] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [actionsTab, setActionsTab] = useState<"inbox" | "create">("inbox");
  // The badge rule: a sheet opened before the unread count loaded picks its tab once the count arrives, unless the
  // member already switched tabs.
  const [tabPickPending, setTabPickPending] = useState(false);
  const [inboxFailed, setInboxFailed] = useState(false);
  const [editTarget, setEditTarget] = useState<Program | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Program | null>(null);
  const [showSignOut, setShowSignOut] = useState(false);
  // polish #22: one error banner for card actions (delete program, cancel request), as on iPhone.
  const [actionError, setActionError] = useState<AppError | null>(null);

  const [declineInviteTarget, setDeclineInviteTarget] = useState<PendingInvite | null>(null);
  const [blockFutureInvites, setBlockFutureInvites] = useState(false);
  const [respondError, setRespondError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [orderedPrograms, setOrderedPrograms] = useState<Program[]>([]);
  const [orderError, setOrderError] = useState<string | null>(null);
  // The final onReorder state update may not have re-rendered the Item's captured
  // onDragEnd yet — the ref always holds the latest order at drag end.
  const orderedRef = useRef<Program[]>([]);

  // Instant open (D-9): the picker list is seeded from the per-member launch cache after bootstrap, then refreshed.
  const programsQuery = useQuery({
    queryKey: PROGRAMS_KEY,
    queryFn: cachedQueryFn(memberId, PROGRAMS_KEY, () => fetchPrograms(token ?? "")),
    enabled: !!token
  });
  useLaunchSeed(memberId, [PROGRAMS_KEY]);

  const invitesQuery = useQuery({
    queryKey: ["invites", isGlobalAdmin],
    queryFn: () => (isGlobalAdmin ? fetchAllInvites(token ?? "") : fetchMyInvites(token ?? "")),
    enabled: !!token
  });

  // D-N4 / the badge rule: the "+" badge = the server's count (`badge`: unread notifications other than invite items +
  // the member's own pending invites) for every role — global admins included (was: every pending invite in the
  // system). Until it loads (or if it fails) a member falls back to their pending-invite count — today's badge.
  const unreadQuery = useUnreadCount(token);
  const badge = unreadQuery.data?.badge ?? (isGlobalAdmin ? 0 : invitesQuery.data?.length ?? 0);
  const searchParams = useClientSearchParams();

  const programsState = fromQuery(programsQuery);
  const invitesState = fromQuery(invitesQuery);
  const online = useOnlineStatus();
  // polish-1 rule 6: nothing to show while offline → the kit's offline view + Retry, never a spinner.
  const offlineEmpty = !online && (programsState.status === "loading" || programsState.status === "failed");
  const listError = offlineEmpty ? appError("offline") : programsState.status === "failed" ? programsState.error : null;
  useRefetchOnReconnect([programsQuery, invitesQuery]);

  const updateMembershipMutation = useMutation({
    mutationFn: (payload: { programId: string; status: string }) => {
      if (!token || !memberId) {
        return Promise.reject(new Error("Missing session."));
      }
      return updateMembership(token, {
        program_id: payload.programId,
        member_id: memberId,
        status: payload.status
      });
    },
    onMutate: () => setActionError(null),
    onError: (error) => setActionError(toAppError(error)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
    }
  });

  const respondInviteMutation = useMutation({
    mutationFn: (payload: {
      inviteId: string;
      action: "accept" | "decline" | "revoke";
      blockFuture?: boolean;
      /** The invite's program — its unread invite items are marked read after an accept / decline. */
      programId?: string;
    }) => {
      if (!token) {
        return Promise.reject(new Error("Missing session."));
      }
      return respondToInvite(token, {
        invite_id: payload.inviteId,
        action: payload.action,
        block_future: payload.blockFuture
      });
    },
    // invites §3.1 (A10): a failed accept / decline / revoke shows the kit message; cleared on the next attempt.
    onMutate: () => setRespondError(null),
    onError: (error) => setRespondError(toAppError(error).message),
    onSettled: async (_data, error, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["invites", isGlobalAdmin] });
      if (!error && variables.action === "accept") {
        await queryClient.invalidateQueries({ queryKey: ["programs"] });
      }
      // The contract's invite-answer rule: the answered invite's unread items are marked read; the badge's pending
      // count drops.
      if (!error && variables.action !== "revoke" && variables.programId) {
        await markInviteItemsRead(queryClient, token, variables.programId);
      }
    }
  });

  const createProgramMutation = useMutation({
    mutationFn: (payload: { name: string; status: string; start_date?: string; end_date?: string }) => {
      if (!token) {
        return Promise.reject(new Error("Missing session."));
      }
      return createProgram(token, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
    }
  });

  const updateProgramMutation = useMutation({
    mutationFn: (payload: { programId: string; name: string; status: string; start_date?: string; end_date?: string }) => {
      if (!token) {
        return Promise.reject(new Error("Missing session."));
      }
      return updateProgram(token, payload.programId, {
        name: payload.name,
        status: payload.status,
        start_date: payload.start_date,
        end_date: payload.end_date
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
    }
  });

  const deleteProgramMutation = useMutation({
    mutationFn: (programId: string) => {
      if (!token) {
        return Promise.reject(new Error("Missing session."));
      }
      return deleteProgram(token, programId);
    },
    onMutate: () => setActionError(null),
    onError: (error) => setActionError(toAppError(error)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
    }
  });

  // polish #22: which invite button is mid-request ("Accepting…" / "Declining…" / "Revoking…").
  const respondPending =
    respondInviteMutation.isPending && respondInviteMutation.variables
      ? { inviteId: respondInviteMutation.variables.inviteId, action: respondInviteMutation.variables.action }
      : null;
  const accountInitials = initials(session?.user.memberName || session?.user.username || "");

  // Server order is the source of truth; local state exists so dragging is optimistic.
  useEffect(() => {
    const data = programsQuery.data ?? [];
    setOrderedPrograms(data);
    orderedRef.current = data;
  }, [programsQuery.data]);

  const saveOrderMutation = useMutation({
    mutationFn: (ids: string[]) => {
      if (!token) {
        return Promise.reject(new Error("Missing session."));
      }
      return saveProgramOrder(token, ids);
    },
    onSuccess: () => setOrderError(null),
    onError: async (error) => {
      setOrderError(`Couldn't save program order. ${toAppError(error).message}`);
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
    }
  });

  const handleDragEnd = () => {
    saveOrderMutation.mutate(orderedRef.current.map((p) => p.id));
  };

  // D-N4 / the badge rule: the sheet opens on the Inbox when something is waiting (badge > 0), else on Create — picked
  // when it opens, never while it's open (reading the inbox lowers the badge). Opened before the unread count loaded:
  // picked once it arrives, unless the member already switched tabs. `?open=inbox` (notification targets, the Program
  // tab's Inbox row) and OPEN_INBOX_EVENT (a toast's View while this page shows) open it on the Inbox.
  // The count is known — or it failed and the invites (the fallback badge) have settled.
  const badgeSettled = unreadQuery.data !== undefined || (unreadQuery.isError && !invitesQuery.isPending);

  const openActions = (tab?: "inbox" | "create") => {
    setRespondError(null);
    setActionsTab(tab ?? (badge > 0 ? "inbox" : "create"));
    setTabPickPending(!tab && !badgeSettled);
    setShowActions(true);
  };

  const chooseTab = (tab: "inbox" | "create") => {
    setTabPickPending(false);
    setActionsTab(tab);
  };

  useEffect(() => {
    if (!tabPickPending || !showActions || !badgeSettled) return;
    setTabPickPending(false);
    setActionsTab(badge > 0 ? "inbox" : "create");
  }, [tabPickPending, showActions, badgeSettled, badge]);

  useEffect(() => {
    if (searchParams.get("open") !== "inbox") return;
    openActions("inbox");
    router.replace("/programs");
  }, [searchParams]);

  useEffect(() => {
    const openInboxHere = () => openActions("inbox");
    window.addEventListener(OPEN_INBOX_EVENT, openInboxHere);
    return () => window.removeEventListener(OPEN_INBOX_EVENT, openInboxHere);
  }, []);

  const handleProgramSelect = (program: Program) => {
    saveActiveProgram({
      id: program.id,
      name: program.name,
      status: program.status,
      start_date: program.start_date ?? null,
      end_date: program.end_date ?? null,
      my_role: program.my_role ?? null,
      my_status: program.my_status ?? null,
      admin_only_data_entry: program.admin_only_data_entry ?? false
    });
    router.push("/summary");
  };

  const programs = programsQuery.data ?? [];
  const searchActive = search.trim().length > 0;
  const visiblePrograms = useMemo(() => {
    if (!searchActive) return orderedPrograms;
    const query = search.trim().toLowerCase();
    return orderedPrograms.filter((p) => p.name.toLowerCase().includes(query));
  }, [orderedPrograms, search, searchActive]);
  const programsLoaded = programsState.status === "loaded" || programsState.status === "stale";
  const canReorder = !searchActive && visiblePrograms.length > 1;

  const renderSearchButton = () => (
    <button
      type="button"
      onClick={() => {
        setSearchOpen((open) => {
          if (open) setSearch("");
          return !open;
        });
      }}
      className="fab-button flex h-12 w-12 items-center justify-center rounded-full shadow-rf-pill"
      aria-label={searchOpen ? "Close search" : "Search programs"}
    >
      <SearchIcon className="h-5 w-5" />
    </button>
  );

  const renderAddButton = () => (
    <button
      type="button"
      onClick={() => openActions()}
      className="fab-button relative flex h-12 w-12 items-center justify-center rounded-full shadow-rf-pill"
      aria-label={badge > 0 ? `Program actions, ${badge} new` : "Program actions"}
    >
      <span className="text-xl font-semibold">+</span>
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rf-danger px-1 text-[11px] font-semibold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );

  return (
    <>
      <PageShell>
        <header className="flex items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-rf-text">My Programs</h1>
            <p className="mt-2 text-sm font-semibold text-rf-text-muted">
              Manage your fitness programs
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Search + add live in the header on desktop; on mobile they float bottom-right (iOS parity) */}
            <div className="hidden sm:block">{renderSearchButton()}</div>
            <button
              type="button"
              onClick={() => setShowAccount(true)}
              className="fab-button flex h-12 w-12 items-center justify-center rounded-full shadow-rf-pill"
              aria-label="Account settings"
            >
              <IconUser className="h-5 w-5" />
            </button>
            <div className="hidden sm:block">{renderAddButton()}</div>
          </div>
        </header>

        <AnimatePresence initial={false}>
          {searchOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSearch("");
                    setSearchOpen(false);
                  }
                }}
                placeholder="Search programs"
                className="input-shell w-full rounded-full px-5 py-3 text-sm font-medium shadow-rf-pill"
              />
            </motion.div>
          )}
        </AnimatePresence>
        {orderError && (
          <p className="text-sm font-semibold text-rf-danger">{orderError}</p>
        )}

        <section className="space-y-6 pb-28 sm:pb-0">
          {programsState.status === "loading" && !offlineEmpty && (
            <div className="glass-card rounded-3xl px-6 py-8 text-center text-rf-text-muted">
              Loading programs…
            </div>
          )}
          {listError && <ErrorView error={listError} onRetry={() => void retryNow(queryClient, PROGRAMS_KEY)} />}
          {programsLoaded && programs.length === 0 && (
            <div className="glass-card rounded-3xl px-6 py-8 text-center">
              <p className="text-lg font-semibold text-rf-text">No programs yet</p>
              <p className="mt-2 text-sm text-rf-text-muted">Create a program to get started.</p>
            </div>
          )}
          {programsLoaded && programs.length > 0 && searchActive && visiblePrograms.length === 0 && (
            <div className="glass-card rounded-3xl px-6 py-8 text-center">
              <p className="text-lg font-semibold text-rf-text">No programs match your search</p>
              <p className="mt-2 text-sm text-rf-text-muted">Try a different name.</p>
            </div>
          )}

          <Reorder.Group
            axis="y"
            as="div"
            values={visiblePrograms}
            onReorder={(next: Program[]) => {
              if (searchActive) return; // filtered indices would corrupt the full order
              setOrderedPrograms(next);
              orderedRef.current = next;
            }}
            className="space-y-6"
          >
            {visiblePrograms.map((program) => {
              const membershipStatus = program.my_status?.toLowerCase() ?? null;
              const canOpen =
                isGlobalAdmin || membershipStatus === null || membershipStatus === "active";
              const canManage =
                isGlobalAdmin || (membershipStatus === "active" && program.my_role === "admin");

              return (
                <ReorderableProgramRow
                  key={program.id}
                  program={program}
                  canReorder={canReorder}
                  onDragEnd={handleDragEnd}
                  canOpen={canOpen}
                  canManage={canManage}
                  membershipStatus={membershipStatus}
                  onSelect={() => canOpen && handleProgramSelect(program)}
                  onEdit={() => setEditTarget(program)}
                  onDelete={() => setDeleteTarget(program)}
                  onCancelRequest={() =>
                    updateMembershipMutation.mutate({ programId: program.id, status: "removed" })
                  }
                  isUpdating={updateMembershipMutation.isPending}
                />
              );
            })}
          </Reorder.Group>
        </section>

        {/* Mobile-only floating action stack (iOS parity): search above add, bottom-right */}
        <div className="fixed z-40 flex flex-col items-center gap-3 bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.5rem,env(safe-area-inset-right))] sm:hidden">
          {renderSearchButton()}
          {renderAddButton()}
        </div>
      </PageShell>

      {/* Kit stale state (the cached list stays): hidden while the global offline banner shows (offline wins); the
          spacer keeps the list's end scrollable above the banner. Priority: action error (polish #22) > stale. */}
      {actionError && online ? (
        <>
          <div aria-hidden="true" className="h-36" />
          <FloatingBanner variant="error" error={actionError} onDismiss={() => setActionError(null)} />
        </>
      ) : (
        programsState.status === "stale" &&
        online && (
          <>
            <div aria-hidden="true" className="h-36" />
            <FloatingBanner variant="stale" onRetry={() => void programsQuery.refetch()} />
          </>
        )
      )}

      <Modal open={showActions} onClose={() => setShowActions(false)}>
        <div className="modal-surface flex w-full max-w-2xl max-h-[90dvh] flex-col overflow-hidden rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-rf-text">Program Actions</h2>
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center px-2 text-sm font-semibold text-rf-text-muted"
              onClick={() => setShowActions(false)}
            >
              Done
            </button>
          </div>

          <div className="segmented-control mt-4 flex rounded-full p-1">
            <TabButton
              active={actionsTab === "inbox"}
              onClick={() => chooseTab("inbox")}
              label={NOTIFICATION_COPY.inbox}
            />
            <TabButton
              active={actionsTab === "create"}
              onClick={() => chooseTab("create")}
              label="Create"
            />
          </div>

          <div className="mt-6 flex-1 overflow-y-auto pr-1">
            {actionsTab === "inbox" ? (
              <div className="space-y-6">
                {/* The inbox-states rule: while the notification list has failed, its ErrorView is the only one shown
                    (its Retry re-reads the invitations too). */}
                <InvitesTab
                  invites={invitesQuery.data ?? []}
                  isLoading={invitesState.status === "loading"}
                  isGlobalAdmin={isGlobalAdmin}
                  error={
                    invitesState.status === "failed" && !inboxFailed
                      ? online
                        ? invitesState.error
                        : appError("offline")
                      : null
                  }
                  onRetry={() => void retryNow(queryClient, ["invites", isGlobalAdmin])}
                  respondError={respondError}
                  pending={respondPending}
                  onAccept={async (invite) => {
                    try {
                      await respondInviteMutation.mutateAsync({
                        inviteId: invite.invite_id,
                        action: "accept",
                        programId: invite.program_id
                      });
                      setShowActions(false);
                    } catch {
                      // keep modal open on error
                    }
                  }}
                  onDecline={(invite) => {
                    setRespondError(null);
                    setDeclineInviteTarget(invite);
                    setBlockFutureInvites(false);
                  }}
                  onRevoke={(invite) =>
                    respondInviteMutation.mutate({ inviteId: invite.invite_id, action: "revoke" })
                  }
                />
                {/* D-N4: the inbox under the pending invites; a row whose target is the inbox itself stays here. */}
                <InboxList
                  token={token}
                  onFailedChange={setInboxFailed}
                  onRetry={() => {
                    if (invitesState.status === "failed") void retryNow(queryClient, ["invites", isGlobalAdmin]);
                  }}
                  onOpenItem={(item) => {
                    if (opensInbox(item.target)) return;
                    setShowActions(false);
                    void openNotificationTarget(item, router, token);
                  }}
                />
              </div>
            ) : (
              <CreateProgramTab
                isSaving={createProgramMutation.isPending}
                errorMessage={createProgramMutation.isError ? toAppError(createProgramMutation.error).message : null}
                onCreate={async (payload) => {
                  try {
                    await createProgramMutation.mutateAsync(payload);
                    setShowActions(false);
                  } catch {
                    // keep modal open on error
                  }
                }}
              />
            )}
          </div>
        </div>
      </Modal>

      <Modal open={showAccount} onClose={() => setShowAccount(false)}>
        <div className="modal-surface w-full max-w-xl rounded-3xl p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="metric-pill flex h-12 w-12 items-center justify-center rounded-full text-rf-text">
                <IconUser className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-rf-text">My Account</h2>
                <p className="text-xs text-rf-text-muted">Manage your profile and preferences.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowAccount(false)}
              className="pill-button inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold"
            >
              Done
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {/* polish #41: the profile row names the member (iOS ProfileRow parity). */}
            <AccountRow
              title={session?.user.memberName || "My Profile"}
              subtitle={session?.user.username ? `@${session.user.username}` : "Update your personal info"}
              icon={
                accountInitials ? (
                  <span className="text-sm font-semibold">{accountInitials}</span>
                ) : (
                  <IconUser className="h-5 w-5" />
                )
              }
              onClick={() => {
                setShowAccount(false);
                router.push("/program/profile");
              }}
            />
            <AccountRow
              title={NOTIFICATION_COPY.inbox}
              subtitle={NOTIFICATION_COPY.inboxRowSubtitle(badge)}
              icon={<IconMail className="h-5 w-5" />}
              count={badge}
              onClick={() => {
                setShowAccount(false);
                openActions("inbox");
              }}
            />
            <AccountRow
              title={NOTIFICATION_COPY.settingsRow}
              subtitle={NOTIFICATION_COPY.settingsRowSubtitle}
              icon={<IconSettings className="h-5 w-5" />}
              onClick={() => {
                setShowAccount(false);
                router.push("/program/notifications");
              }}
            />
            <AccountRow
              title="Change Password"
              subtitle="Update your account password"
              icon={<IconLock className="h-5 w-5" />}
              onClick={() => {
                setShowAccount(false);
                router.push("/program/password");
              }}
            />
            <AccountRow
              title="Appearance"
              subtitle="Choose light or dark mode"
              icon={<IconPalette className="h-5 w-5" />}
              onClick={() => {
                setShowAccount(false);
                router.push("/program/appearance");
              }}
            />
            {isGlobalAdmin && (
              <AccountRow
                title={NOTIFICATION_COPY.announcementsRow}
                subtitle={NOTIFICATION_COPY.announcementsRowSubtitle}
                icon={<IconUsers className="h-5 w-5" />}
                onClick={() => {
                  setShowAccount(false);
                  router.push("/program/announcements");
                }}
              />
            )}
            <AccountRow
              title="Privacy Policy"
              subtitle="Learn how we handle your data"
              icon={<IconDocument className="h-5 w-5" />}
              onClick={() => {
                setShowAccount(false);
                // Public pages with no in-app back open beside the app, as the phones do (privacy-policy D-ONE).
                window.open(PRIVACY_POLICY_URL, "_blank", "noopener");
              }}
            />
            <AccountRow
              title="Support"
              subtitle="Get help or contact us"
              icon={<IconHelp className="h-5 w-5" />}
              onClick={() => {
                setShowAccount(false);
                window.open("/support", "_blank", "noopener"); // polish #41 — same rule as Privacy above
              }}
            />
            <AccountRow
              title="Sign Out"
              subtitle="Log out of your account"
              icon={<IconLogout className="h-5 w-5" />}
              tone="danger"
              onClick={() => {
                setShowAccount(false);
                setShowSignOut(true);
              }}
            />
          </div>
        </div>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)}>
        {editTarget && (
          <EditProgramModal
            program={editTarget}
            isSaving={updateProgramMutation.isPending}
            errorMessage={updateProgramMutation.isError ? toAppError(updateProgramMutation.error).message : null}
            onCancel={() => setEditTarget(null)}
            onSave={async (payload) => {
              try {
                await updateProgramMutation.mutateAsync({ programId: editTarget.id, ...payload });
                setEditTarget(null);
              } catch {
                // errorMessage shows in the modal
              }
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Program?"
        description={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          // polish #22: a failure shows in the action-error banner (mutation onError), never unhandled.
          if (deleteTarget) deleteProgramMutation.mutate(deleteTarget.id);
        }}
      />

      <ConfirmDialog
        open={showSignOut}
        title="Sign Out"
        description="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        danger
        onClose={() => setShowSignOut(false)}
        onConfirm={async () => {
          await signOut();
          router.push("/login");
        }}
      />

      <Modal
        open={!!declineInviteTarget}
        onClose={() => {
          setDeclineInviteTarget(null);
          setBlockFutureInvites(false);
        }}
      >
        <div className="modal-surface w-full max-w-md rounded-3xl p-6">
          <h3 className="text-lg font-semibold text-rf-text">Decline Invitation</h3>
          <p className="mt-2 text-sm text-rf-text-muted">
            {declineInviteTarget
              ? `Decline invitation to ${declineInviteTarget.program_name ?? "this program"}?`
              : ""}
          </p>
          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-rf-border bg-rf-surface-muted px-4 py-3 text-sm font-semibold text-rf-text">
            <input
              type="checkbox"
              className="h-4 w-4 accent-rf-accent"
              checked={blockFutureInvites}
              onChange={(event) => setBlockFutureInvites(event.target.checked)}
            />
            Block future invites from this program
          </label>
          {respondError && <p className="mt-4 text-sm font-semibold text-rf-danger">{respondError}</p>}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setDeclineInviteTarget(null);
                setBlockFutureInvites(false);
              }}
              className="pill-button rounded-2xl px-4 py-3 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!declineInviteTarget) return;
                try {
                  await respondInviteMutation.mutateAsync({
                    inviteId: declineInviteTarget.invite_id,
                    action: "decline",
                    blockFuture: blockFutureInvites,
                    programId: declineInviteTarget.program_id
                  });
                  setDeclineInviteTarget(null);
                  setBlockFutureInvites(false);
                } catch {
                  // respondError shows in this modal
                }
              }}
              disabled={respondInviteMutation.isPending}
              className="danger-pill rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {respondInviteMutation.isPending ? "Declining…" : "Decline"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

type ProgramCardProps = {
  program: Program;
  membershipStatus: string | null;
  canOpen: boolean;
  canManage: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCancelRequest: () => void;
  isUpdating: boolean;
  dragHandle?: React.ReactNode;
};

// Wrapper so useDragControls runs per item: the card drags only by its grip handle
// (dragListener=false), never by the card body — taps stay tap-to-enter and touch
// scrolling is unaffected.
function ReorderableProgramRow({
  canReorder,
  onDragEnd,
  ...cardProps
}: ProgramCardProps & { canReorder: boolean; onDragEnd: () => void }) {
  const dragControls = useDragControls();
  const { program } = cardProps;

  return (
    <Reorder.Item
      value={program}
      as="div"
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      className="relative"
    >
      <ProgramCard
        {...cardProps}
        dragHandle={
          canReorder ? (
            <button
              type="button"
              aria-label={`Reorder ${program.name}`}
              className="flex h-11 w-11 cursor-grab touch-none items-center justify-center rounded-full text-rf-text-muted hover:text-rf-text active:cursor-grabbing"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dragControls.start(event);
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M2 4.5h12M2 8h12M2 11.5h12"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null
        }
      />
    </Reorder.Item>
  );
}

function ProgramCard({
  program,
  membershipStatus,
  canOpen,
  canManage,
  onSelect,
  onEdit,
  onDelete,
  onCancelRequest,
  isUpdating,
  dragHandle
}: ProgramCardProps) {
  const isInvited = membershipStatus === "invited";
  const isRequested = membershipStatus === "requested";
  // D3 (programs SPEC §9): one number — the backend counts active and total members the same way (F2).
  const memberCount = program.total_members ?? 0;
  // The bar is time elapsed (days in / total days), the server's progress_percent — Android parity. Not active/total
  // members: the backend counts both the same way, so that ratio was always a full bar.
  const progress = Math.min(Math.max((program.progress_percent ?? 0) / 100, 0), 1);
  const programStatusColor = statusColor(program.status ?? "active");

  return (
    <GlassCard
      padding="lg"
      className={`transition ${canOpen ? "cursor-pointer hover:shadow-lg" : "opacity-70"}`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-rf-text">
            {/* polish #37: the keyboard / screen-reader way in. A real button (the card's inner Edit / Delete / Cancel
                stay separately reachable); stopPropagation so the card's own click doesn't open it twice. */}
            <button
              type="button"
              disabled={!canOpen}
              onClick={(event) => {
                event.stopPropagation();
                onSelect();
              }}
              className="rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-rf-accent disabled:cursor-default"
            >
              {program.name}
            </button>
          </h3>
          <p className="mt-2 text-sm text-rf-text-muted">{formatDateRange(program.start_date, program.end_date)}</p>
        </div>
        <div className="flex items-center gap-2">
          {dragHandle}
          <StatusBadge variant={programStatusVariant(program.status ?? "active")}>
            {program.status ?? "active"}
          </StatusBadge>
        </div>
      </div>

      {isInvited || isRequested ? (
        <p className="mt-4 text-sm font-semibold text-rf-text-muted">
          {isInvited ? "Invitation pending" : "Request pending approval"}
        </p>
      ) : (
        <p className="mt-4 text-sm font-semibold text-rf-text-muted">
          {memberCount === 1 ? "1 member" : `${memberCount} members`}
        </p>
      )}

      <div className="progress-track mt-4 h-2 w-full rounded-full">
        <div
          className="h-2 rounded-full"
          style={{ background: programStatusColor, width: `${progress * 100}%` }}
        />
      </div>

      {/* invites D-C8: an `invited` card has no actions (the My Invites inbox is the one path); `requested` keeps
          its Cancel request. */}
      {isRequested && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCancelRequest();
            }}
            className="inline-flex min-h-[44px] items-center rounded-full bg-rf-surface-muted px-4 text-sm font-semibold text-rf-text disabled:opacity-60"
            disabled={isUpdating}
          >
            Cancel request
          </button>
        </div>
      )}

      {canManage && (
        <div className="mt-5 flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
            className="inline-flex min-h-[44px] items-center px-1 font-semibold text-rf-text-muted hover:text-rf-text"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="inline-flex min-h-[44px] items-center px-1 font-semibold text-rf-danger"
          >
            Delete
          </button>
        </div>
      )}
    </GlassCard>
  );
}

function statusColor(status?: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "completed":
      return "#2fb861";
    case "planned":
      return "#3b82f6";
    default:
      return "#ff8b1f";
  }
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      data-active={active}
      aria-pressed={active}
      className="flex min-h-[44px] flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold transition"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function InvitesTab({
  invites,
  isLoading,
  isGlobalAdmin,
  error,
  onRetry,
  respondError,
  pending,
  onAccept,
  onDecline,
  onRevoke
}: {
  invites: PendingInvite[];
  isLoading: boolean;
  isGlobalAdmin: boolean;
  error: AppError | null;
  onRetry: () => void;
  /** The last accept / decline / revoke failure (kit message). */
  respondError: string | null;
  /** The invite button mid-request (polish #22); every invite button is disabled while one runs. */
  pending: { inviteId: string; action: "accept" | "decline" | "revoke" } | null;
  onAccept: (invite: PendingInvite) => void;
  onDecline: (invite: PendingInvite) => void;
  onRevoke: (invite: PendingInvite) => void;
}) {
  if (isLoading) {
    return <div className="text-center text-sm text-rf-text-muted">Loading invites…</div>;
  }

  if (error) return <ErrorView error={error} onRetry={onRetry} />;

  const respondLine = respondError ? (
    <p className="text-sm font-semibold text-rf-danger">{respondError}</p>
  ) : null;

  // D-N4: inside the Inbox an empty invite list renders nothing (the notifications' own empty state follows).
  if (invites.length === 0) return respondLine;

  if (isGlobalAdmin) {
    const grouped = invites.reduce<Record<string, PendingInvite[]>>((acc, invite) => {
      const key = invite.program_name ?? "Unknown Program";
      acc[key] = acc[key] ?? [];
      acc[key].push(invite);
      return acc;
    }, {});

    return (
      <div className="space-y-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-rf-text-muted">{NOTIFICATION_COPY.allInvitesHeading}</h3>
        {respondLine}
        {Object.keys(grouped).map((programName) => (
          <div key={programName} className="space-y-3">
            <h3 className="text-sm font-semibold text-rf-text">{programName}</h3>
            <div className="space-y-3">
              {grouped[programName].map((invite) => (
                <InviteCard
                  key={invite.invite_id}
                  invite={invite}
                  isAdmin
                  pendingAction={pending && pending.inviteId === invite.invite_id ? pending.action : null}
                  busy={pending !== null}
                  onAccept={() => onAccept(invite)}
                  onDecline={() => onDecline(invite)}
                  onRevoke={() => onRevoke(invite)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-rf-text-muted">{NOTIFICATION_COPY.invitationsHeading}</h3>
      {respondLine}
      {invites.map((invite) => (
        <InviteCard
          key={invite.invite_id}
          invite={invite}
          isAdmin={false}
          pendingAction={pending && pending.inviteId === invite.invite_id ? pending.action : null}
          busy={pending !== null}
          onAccept={() => onAccept(invite)}
          onDecline={() => onDecline(invite)}
          onRevoke={null}
        />
      ))}
    </div>
  );
}

function InviteCard({
  invite,
  isAdmin,
  pendingAction,
  busy,
  onAccept,
  onDecline,
  onRevoke
}: {
  invite: PendingInvite;
  isAdmin: boolean;
  pendingAction: "accept" | "decline" | "revoke" | null;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onRevoke: (() => void) | null;
}) {
  return (
    <div className="rounded-2xl border border-rf-border bg-rf-surface p-5">
      <div className="flex items-start justify-between gap-4">
        {!isAdmin && (
          <h4 className="text-base font-semibold text-rf-text">
            {invite.program_name ?? "Unknown Program"}
          </h4>
        )}
        <StatusBadge variant={programStatusVariant(invite.program_status ?? "active")}>
          {invite.program_status ?? "active"}
        </StatusBadge>
      </div>

      {isAdmin && (invite.invited_member_name || invite.invited_username) && (
        <p className="mt-2 text-sm font-medium text-rf-text">
          To: {invite.invited_member_name ?? invite.invited_username}
          {invite.invited_member_name && invite.invited_username
            ? ` (@${invite.invited_username})`
            : ""}
        </p>
      )}

      <p className="mt-2 text-sm text-rf-text-muted">
        {formatDateRange(invite.program_start_date, invite.program_end_date)}
      </p>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-rf-text-muted">
        <span>
          {invite.invited_by_name ? `Invited by ${invite.invited_by_name}` : ""}
        </span>
        <span>{formatInviteDate(invite.invited_at)}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded-full bg-rf-accent px-4 text-sm font-semibold text-black disabled:opacity-60"
          onClick={onAccept}
        >
          {pendingAction === "accept" ? "Accepting…" : "Accept"}
        </button>
        <button
          type="button"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded-full bg-rf-surface-muted px-4 text-sm font-semibold text-rf-text disabled:opacity-60"
          onClick={onDecline}
        >
          {pendingAction === "decline" ? "Declining…" : "Decline"}
        </button>
        {isAdmin && onRevoke && (
          <button
            type="button"
            disabled={busy}
            className="inline-flex min-h-[44px] items-center rounded-full border border-rf-danger px-4 text-sm font-semibold text-rf-danger disabled:opacity-60"
            onClick={onRevoke}
          >
            {pendingAction === "revoke" ? "Revoking…" : "Revoke"}
          </button>
        )}
      </div>
    </div>
  );
}

function CreateProgramTab({
  isSaving,
  errorMessage,
  onCreate
}: {
  isSaving: boolean;
  errorMessage: string | null;
  onCreate: (payload: { name: string; status: string; start_date?: string; end_date?: string }) => void;
}) {
  // A9: the browser's local calendar day (toISOString() is the UTC day — tomorrow on a US evening), as iOS + Android.
  const today = todayLocalISO();
  const defaultEnd = toLocalISODate(new Date(new Date().setMonth(new Date().getMonth() + 3)));

  const [name, setName] = useState("");
  const [status, setStatus] = useState("planned");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd);

  // polish #38 (programs: create date guard): the Edit rule. Start must be strictly before end (the server enforces
  // it too).
  const datesInvalid = startDate !== "" && endDate !== "" && startDate >= endDate;
  const isValid = name.trim().length > 0 && !datesInvalid;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="create-program-name" className="text-sm font-semibold text-rf-text">Program name</label>
        <input
          id="create-program-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
          placeholder="e.g. Summer 2026 Challenge"
          autoCapitalize="words"
        />
      </div>

      <Select
        label="Status"
        value={status}
        options={STATUS_OPTIONS.map((option) => ({
          value: option,
          label: option
        }))}
        onChange={setStatus}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor="create-program-start" className="text-sm font-semibold text-rf-text">Start date</label>
          <input
            id="create-program-start"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="input-shell mt-2 w-full min-w-0 rounded-2xl px-4 py-3 text-sm font-medium"
          />
        </div>
        <div className="min-w-0">
          <label htmlFor="create-program-end" className="text-sm font-semibold text-rf-text">End date</label>
          <input
            id="create-program-end"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="input-shell mt-2 w-full min-w-0 rounded-2xl px-4 py-3 text-sm font-medium"
          />
        </div>
      </div>
      {datesInvalid && <p className="text-xs font-semibold text-rf-danger">End date must be after the start date.</p>}

      {errorMessage && <p className="text-sm font-semibold text-rf-danger">{errorMessage}</p>}

      <button
        type="button"
        disabled={!isValid || isSaving}
        onClick={() =>
          onCreate({
            name: name.trim(),
            status,
            start_date: startDate,
            end_date: endDate
          })
        }
        className="w-full rounded-2xl bg-rf-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
      >
        {isSaving ? "Creating…" : "Create Program"}
      </button>
    </div>
  );
}

function EditProgramModal({
  program,
  isSaving,
  errorMessage,
  onCancel,
  onSave
}: {
  program: Program;
  isSaving: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSave: (payload: { name: string; status: string; start_date?: string; end_date?: string }) => void;
}) {
  const [name, setName] = useState(program.name);
  const [status, setStatus] = useState((program.status ?? "planned").toLowerCase());
  const [startDate, setStartDate] = useState(program.start_date ?? "");
  const [endDate, setEndDate] = useState(program.end_date ?? "");
  const datesInvalid = startDate !== "" && endDate !== "" && startDate >= endDate; // polish #38

  return (
    <div className="modal-surface w-full max-w-lg rounded-3xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-rf-text">Edit Program</h2>
        <button
          type="button"
          onClick={onCancel}
          className="pill-button inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold"
        >
          Close
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="edit-program-name" className="text-sm font-semibold text-rf-text">Program name</label>
          <input
            id="edit-program-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
            autoCapitalize="words"
          />
        </div>

      <Select
        label="Status"
        value={status}
        options={STATUS_OPTIONS.map((option) => ({
          value: option,
          label: option
        }))}
        onChange={setStatus}
      />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor="edit-program-start" className="text-sm font-semibold text-rf-text">Start date</label>
            <input
              id="edit-program-start"
              type="date"
              value={startDate ?? ""}
              onChange={(event) => setStartDate(event.target.value)}
              className="input-shell mt-2 w-full min-w-0 rounded-2xl px-4 py-3 text-sm font-medium"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="edit-program-end" className="text-sm font-semibold text-rf-text">End date</label>
            <input
              id="edit-program-end"
              type="date"
              value={endDate ?? ""}
              onChange={(event) => setEndDate(event.target.value)}
              className="input-shell mt-2 w-full min-w-0 rounded-2xl px-4 py-3 text-sm font-medium"
            />
          </div>
        </div>
        {datesInvalid && <p className="text-xs font-semibold text-rf-danger">End date must be after the start date.</p>}

        {errorMessage && <p className="text-sm font-semibold text-rf-danger">{errorMessage}</p>}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="pill-button inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving || datesInvalid}
            onClick={() =>
              onSave({
                name: name.trim(),
                status,
                start_date: startDate || undefined,
                end_date: endDate || undefined
              })
            }
            className="inline-flex min-h-[44px] items-center rounded-full bg-rf-accent px-5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountRow({
  title,
  subtitle,
  icon,
  onClick,
  tone = "default",
  count
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
  count?: number;
}) {
  const isDanger = tone === "danger";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
        isDanger
          ? "danger-row"
          : "border-rf-border bg-rf-surface-muted text-rf-text hover:border-rf-accent/60"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          isDanger ? "danger-icon" : "metric-pill text-rf-text"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate ${isDanger ? "text-rf-danger" : "text-rf-text"}`}>{title}</p>
        <p className="truncate text-xs text-rf-text-muted">{subtitle}</p>
      </div>
      {count ? (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rf-danger px-1.5 text-[11px] font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
      <span className={isDanger ? "text-rf-danger" : "text-rf-text-muted"}>›</span>
    </button>
  );
}
