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
import { formatDateRange, formatInviteDate } from "@/lib/format";
import { saveActiveProgram } from "@/lib/storage";
import { PageShell } from "@/components/ui/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusBadge, programStatusVariant } from "@/components/ui/StatusBadge";
import { IconUser, IconLock, IconPalette, IconDocument, IconLogout, SearchIcon } from "@/components/icons";

const STATUS_OPTIONS = ["planned", "active", "completed"] as const;

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
  const [actionsTab, setActionsTab] = useState<"invites" | "create">("invites");
  const [editTarget, setEditTarget] = useState<Program | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Program | null>(null);
  const [showSignOut, setShowSignOut] = useState(false);

  const [declineInviteTarget, setDeclineInviteTarget] = useState<PendingInvite | null>(null);
  const [blockFutureInvites, setBlockFutureInvites] = useState(false);

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [orderedPrograms, setOrderedPrograms] = useState<Program[]>([]);
  const [orderError, setOrderError] = useState<string | null>(null);
  // The final onReorder state update may not have re-rendered the Item's captured
  // onDragEnd yet — the ref always holds the latest order at drag end.
  const orderedRef = useRef<Program[]>([]);

  const programsQuery = useQuery({
    queryKey: ["programs"],
    queryFn: () => fetchPrograms(token ?? ""),
    enabled: !!token
  });

  const invitesQuery = useQuery({
    queryKey: ["invites", isGlobalAdmin],
    queryFn: () => (isGlobalAdmin ? fetchAllInvites(token ?? "") : fetchMyInvites(token ?? "")),
    enabled: !!token
  });

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
    }
  });

  const respondInviteMutation = useMutation({
    mutationFn: (payload: { inviteId: string; action: "accept" | "decline" | "revoke"; blockFuture?: boolean }) => {
      if (!token) {
        return Promise.reject(new Error("Missing session."));
      }
      return respondToInvite(token, {
        invite_id: payload.inviteId,
        action: payload.action,
        block_future: payload.blockFuture
      });
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["invites", isGlobalAdmin] });
      if (variables.action === "accept") {
        await queryClient.invalidateQueries({ queryKey: ["programs"] });
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
    }
  });

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
      setOrderError(error instanceof Error ? error.message : "Couldn't save program order.");
      await queryClient.invalidateQueries({ queryKey: ["programs"] });
    }
  });

  const handleDragEnd = () => {
    saveOrderMutation.mutate(orderedRef.current.map((p) => p.id));
  };

  const pendingInvitesCount = invitesQuery.data?.length ?? 0;

  useEffect(() => {
    if (showActions) {
      setActionsTab(pendingInvitesCount > 0 ? "invites" : "create");
    }
  }, [showActions, pendingInvitesCount]);

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
  const canReorder = !searchActive && visiblePrograms.length > 1;

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
            <button
              type="button"
              onClick={() => setShowAccount(true)}
              className="fab-button flex h-12 w-12 items-center justify-center rounded-full shadow-rf-pill"
              aria-label="Account settings"
            >
              <IconUser className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setShowActions(true)}
              className="fab-button relative flex h-12 w-12 items-center justify-center rounded-full shadow-rf-pill"
              aria-label="Program actions"
            >
              <span className="text-xl font-semibold">+</span>
              {pendingInvitesCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rf-danger px-1 text-[11px] font-semibold text-white">
                  {pendingInvitesCount}
                </span>
              )}
            </button>
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

        <section className="space-y-6">
          {programsQuery.isLoading && (
            <div className="glass-card rounded-3xl px-6 py-8 text-center text-rf-text-muted">
              Loading programs…
            </div>
          )}
          {programsQuery.isError && (
            <div className="glass-card rounded-3xl px-6 py-8 text-center text-rf-danger">
              {(programsQuery.error as Error).message}
            </div>
          )}
          {!programsQuery.isLoading && programs.length === 0 && (
            <div className="glass-card rounded-3xl px-6 py-8 text-center">
              <p className="text-lg font-semibold text-rf-text">No programs yet</p>
              <p className="mt-2 text-sm text-rf-text-muted">Create a program to get started.</p>
            </div>
          )}
          {!programsQuery.isLoading && programs.length > 0 && searchActive && visiblePrograms.length === 0 && (
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
                  onAcceptInvite={() =>
                    updateMembershipMutation.mutate({ programId: program.id, status: "active" })
                  }
                  onDeclineInvite={() =>
                    updateMembershipMutation.mutate({ programId: program.id, status: "removed" })
                  }
                  isUpdating={updateMembershipMutation.isPending}
                />
              );
            })}
          </Reorder.Group>
        </section>
      </PageShell>

      <Modal open={showActions} onClose={() => setShowActions(false)}>
        <div className="modal-surface flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-rf-text">Program Actions</h2>
            <button
              className="text-sm font-semibold text-rf-text-muted"
              onClick={() => setShowActions(false)}
            >
              Done
            </button>
          </div>

          <div className="segmented-control mt-4 flex rounded-full p-1">
            <TabButton
              active={actionsTab === "invites"}
              onClick={() => setActionsTab("invites")}
              label={isGlobalAdmin ? "All Invites" : "My Invites"}
            />
            <TabButton
              active={actionsTab === "create"}
              onClick={() => setActionsTab("create")}
              label="Create"
            />
          </div>

          <div className="mt-6 flex-1 overflow-y-auto pr-1">
            {actionsTab === "invites" ? (
              <InvitesTab
                invites={invitesQuery.data ?? []}
                isLoading={invitesQuery.isLoading}
                isGlobalAdmin={isGlobalAdmin}
                errorMessage={invitesQuery.isError ? (invitesQuery.error as Error).message : null}
                onAccept={async (invite) => {
                  try {
                    await respondInviteMutation.mutateAsync({
                      inviteId: invite.invite_id,
                      action: "accept"
                    });
                    setShowActions(false);
                  } catch {
                    // keep modal open on error
                  }
                }}
                onDecline={(invite) => {
                  setDeclineInviteTarget(invite);
                  setBlockFutureInvites(false);
                }}
                onRevoke={(invite) =>
                  respondInviteMutation.mutate({ inviteId: invite.invite_id, action: "revoke" })
                }
              />
            ) : (
              <CreateProgramTab
                isSaving={createProgramMutation.isPending}
                errorMessage={createProgramMutation.isError ? (createProgramMutation.error as Error).message : null}
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
              className="pill-button rounded-full px-3 py-1 text-xs font-semibold"
            >
              Done
            </button>
          </div>

          <div className="mt-6 space-y-3">
            <AccountRow
              title="My Profile"
              subtitle="Update your personal info"
              icon={<IconUser className="h-5 w-5" />}
              onClick={() => {
                setShowAccount(false);
                router.push("/program/profile");
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
            <AccountRow
              title="Privacy Policy"
              subtitle="Learn how we handle your data"
              icon={<IconDocument className="h-5 w-5" />}
              onClick={() => {
                setShowAccount(false);
                router.push("/program/privacy");
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
            errorMessage={updateProgramMutation.isError ? (updateProgramMutation.error as Error).message : null}
            onCancel={() => setEditTarget(null)}
            onSave={async (payload) => {
              await updateProgramMutation.mutateAsync({
                programId: editTarget.id,
                ...payload
              });
              setEditTarget(null);
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
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteProgramMutation.mutateAsync(deleteTarget.id);
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
                await respondInviteMutation.mutateAsync({
                  inviteId: declineInviteTarget.invite_id,
                  action: "decline",
                  blockFuture: blockFutureInvites
                });
                setDeclineInviteTarget(null);
                setBlockFutureInvites(false);
              }}
              className="danger-pill rounded-2xl px-4 py-3 text-sm font-semibold"
            >
              Decline
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
  onAcceptInvite: () => void;
  onDeclineInvite: () => void;
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
              className="cursor-grab touch-none p-1 text-rf-text-muted hover:text-rf-text active:cursor-grabbing"
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
  onAcceptInvite,
  onDeclineInvite,
  isUpdating,
  dragHandle
}: ProgramCardProps) {
  const isInvited = membershipStatus === "invited";
  const isRequested = membershipStatus === "requested";
  const activeMembers = program.active_members ?? 0;
  const totalMembers = program.total_members ?? 0;
  const progress = totalMembers > 0 ? Math.min(activeMembers / totalMembers, 1) : 0;
  const programStatusColor = statusColor(program.status ?? "active");

  return (
    <GlassCard
      padding="lg"
      className={`transition ${canOpen ? "cursor-pointer hover:shadow-lg" : "opacity-70"}`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-rf-text">{program.name}</h3>
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
          {activeMembers} active / {totalMembers} total members
        </p>
      )}

      <div className="progress-track mt-4 h-2 w-full rounded-full">
        <div
          className="h-2 rounded-full"
          style={{ background: programStatusColor, width: `${progress * 100}%` }}
        />
      </div>

      {(isInvited || isRequested) && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {isInvited && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAcceptInvite();
              }}
              className="rounded-full bg-rf-accent px-4 py-2 text-sm font-semibold text-black"
              disabled={isUpdating}
            >
              Accept
            </button>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDeclineInvite();
            }}
            className="rounded-full bg-rf-surface-muted px-4 py-2 text-sm font-semibold text-rf-text"
            disabled={isUpdating}
          >
            {isRequested ? "Cancel request" : "Decline"}
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
            className="font-semibold text-rf-text-muted hover:text-rf-text"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="font-semibold text-rf-danger"
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
      className="flex-1 rounded-full px-4 py-2 text-sm font-semibold transition"
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
  errorMessage,
  onAccept,
  onDecline,
  onRevoke
}: {
  invites: PendingInvite[];
  isLoading: boolean;
  isGlobalAdmin: boolean;
  errorMessage: string | null;
  onAccept: (invite: PendingInvite) => void;
  onDecline: (invite: PendingInvite) => void;
  onRevoke: (invite: PendingInvite) => void;
}) {
  if (isLoading) {
    return <div className="text-center text-sm text-rf-text-muted">Loading invites…</div>;
  }

  if (errorMessage) {
    return <div className="text-center text-sm text-rf-danger">{errorMessage}</div>;
  }

  if (invites.length === 0) {
    return (
      <div className="rounded-2xl bg-rf-surface-muted px-6 py-10 text-center">
        <p className="text-base font-semibold text-rf-text">No pending invitations</p>
        <p className="mt-2 text-sm text-rf-text-muted">
          {isGlobalAdmin
            ? "There are no pending invites in the system."
            : "You don't have any program invitations right now."}
        </p>
      </div>
    );
  }

  if (isGlobalAdmin) {
    const grouped = invites.reduce<Record<string, PendingInvite[]>>((acc, invite) => {
      const key = invite.program_name ?? "Unknown Program";
      acc[key] = acc[key] ?? [];
      acc[key].push(invite);
      return acc;
    }, {});

    return (
      <div className="space-y-6">
        {Object.keys(grouped).map((programName) => (
          <div key={programName} className="space-y-3">
            <h3 className="text-sm font-semibold text-rf-text">{programName}</h3>
            <div className="space-y-3">
              {grouped[programName].map((invite) => (
                <InviteCard
                  key={invite.invite_id}
                  invite={invite}
                  isAdmin
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
      {invites.map((invite) => (
        <InviteCard
          key={invite.invite_id}
          invite={invite}
          isAdmin={false}
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
  onAccept,
  onDecline,
  onRevoke
}: {
  invite: PendingInvite;
  isAdmin: boolean;
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
          className="rounded-full bg-rf-accent px-4 py-2 text-xs font-semibold text-black"
          onClick={onAccept}
        >
          Accept
        </button>
        <button
          className="rounded-full bg-rf-surface-muted px-4 py-2 text-xs font-semibold text-rf-text"
          onClick={onDecline}
        >
          Decline
        </button>
        {isAdmin && onRevoke && (
          <button
            className="rounded-full border border-rf-danger px-4 py-2 text-xs font-semibold text-rf-danger"
            onClick={onRevoke}
          >
            Revoke
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
  const today = new Date().toISOString().slice(0, 10);
  const defaultEnd = new Date(new Date().setMonth(new Date().getMonth() + 3))
    .toISOString()
    .slice(0, 10);

  const [name, setName] = useState("");
  const [status, setStatus] = useState("planned");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd);

  const isValid = name.trim().length > 0;

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-semibold text-rf-text">Program name</label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
          placeholder="e.g. Summer 2026 Challenge"
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
        <div>
          <label className="text-sm font-semibold text-rf-text">Start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-rf-text">End date</label>
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
          />
        </div>
      </div>

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
        className="w-full rounded-2xl bg-rf-accent px-4 py-3 text-sm font-semibold text-black"
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

  return (
    <div className="modal-surface w-full max-w-lg rounded-3xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-rf-text">Edit Program</h2>
        <button onClick={onCancel} className="pill-button rounded-full px-3 py-1 text-xs font-semibold">
          Close
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label className="text-sm font-semibold text-rf-text">Program name</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
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
          <div>
            <label className="text-sm font-semibold text-rf-text">Start date</label>
            <input
              type="date"
              value={startDate ?? ""}
              onChange={(event) => setStartDate(event.target.value)}
              className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-rf-text">End date</label>
            <input
              type="date"
              value={endDate ?? ""}
              onChange={(event) => setEndDate(event.target.value)}
              className="input-shell mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium"
            />
          </div>
        </div>

        {errorMessage && <p className="text-sm font-semibold text-rf-danger">{errorMessage}</p>}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="pill-button rounded-full px-4 py-2 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() =>
              onSave({
                name: name.trim(),
                status,
                start_date: startDate || undefined,
                end_date: endDate || undefined
              })
            }
            className="rounded-full bg-rf-accent px-5 py-2 text-sm font-semibold text-black"
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
  tone = "default"
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
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
        className={`flex h-10 w-10 items-center justify-center rounded-full ${
          isDanger ? "danger-icon" : "metric-pill text-rf-text"
        }`}
      >
        {icon}
      </span>
      <div className="flex-1">
        <p className={isDanger ? "text-rf-danger" : "text-rf-text"}>{title}</p>
        <p className="text-xs text-rf-text-muted">{subtitle}</p>
      </div>
      <span className={isDanger ? "text-rf-danger" : "text-rf-text-muted"}>›</span>
    </button>
  );
}
