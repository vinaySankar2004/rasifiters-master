"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPrograms } from "@/lib/api/programs";
import {
  ANNOUNCEMENT_COPY,
  ANNOUNCEMENT_KEYS,
  MEMBERS_MAX,
  fetchMemberDirectory,
  type TargetKind
} from "@/lib/api/announcements";
import { appError, toAppError } from "@/lib/kit/app-error";
import { fromQuery, retryNow } from "@/lib/kit/async-state";
import { useOnlineStatus } from "@/lib/kit/use-online-status";
import { ErrorView } from "@/components/kit/ErrorView";

const TARGET_KINDS: TargetKind[] = ["program", "members", "everyone"];
type Self = { id: string; name: string };

// The composer's "Send to" (D-N16): one program's active members · chosen members · everyone. A native <select> for the
// program (SelectMobile doesn't portal and the form sits in a .glass-card).
export function AudiencePicker({
  token,
  self,
  targetKind,
  onTargetKind,
  programId,
  onProgram,
  memberIds,
  onMemberIds
}: {
  token: string;
  self: Self;
  targetKind: TargetKind;
  onTargetKind: (kind: TargetKind) => void;
  programId: string;
  onProgram: (id: string, name: string | null) => void;
  memberIds: string[];
  onMemberIds: (ids: string[]) => void;
}) {
  const programsQuery = useQuery({ queryKey: ["programs"], queryFn: () => fetchPrograms(token), enabled: !!token });
  const programs = programsQuery.data ?? [];

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-rf-text">{ANNOUNCEMENT_COPY.targetLabel}</p>
      <div className="segmented-control flex rounded-full p-1">
        {TARGET_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            data-active={targetKind === kind}
            onClick={() => onTargetKind(kind)}
            className="min-h-[44px] flex-1 rounded-full px-2 text-sm font-semibold transition"
          >
            {ANNOUNCEMENT_COPY.targets[kind]}
          </button>
        ))}
      </div>
      {targetKind === "program" && (
        <select
          value={programId}
          onChange={(event) => {
            const id = event.target.value;
            onProgram(id, programs.find((program) => program.id === id)?.name ?? null);
          }}
          aria-label={ANNOUNCEMENT_COPY.targets.program}
          className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium text-rf-text"
        >
          <option value="">{ANNOUNCEMENT_COPY.chooseProgram}</option>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}
            </option>
          ))}
        </select>
      )}
      {targetKind === "program" && programsQuery.isError && (
        <p className="text-sm font-semibold text-rf-danger">{toAppError(programsQuery.error).message}</p>
      )}
      {targetKind === "members" && <MemberPicker token={token} self={self} selected={memberIds} onChange={onMemberIds} />}
      {targetKind === "everyone" && <p className="text-xs text-rf-text-muted">{ANNOUNCEMENT_COPY.everyoneHint}</p>}
    </div>
  );
}

// "Chosen members": a multi-select over GET /api/members — the full directory for global admins (members D-C3), which
// lists standard members only, so the sender is pinned first as "You" (W19 — test a send on yourself). Only ACTIVE
// members are listed (the server rejects inactive ids); at most 200 (the server's limit).
export function MemberPicker({
  token,
  self,
  selected,
  onChange
}: {
  token: string;
  self: Self;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [search, setSearch] = useState("");
  const directoryQuery = useQuery({
    queryKey: ANNOUNCEMENT_KEYS.directory,
    queryFn: () => fetchMemberDirectory(token),
    enabled: !!token
  });
  const state = fromQuery(directoryQuery);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (directoryQuery.data ?? []).filter(
      (member) =>
        member.id !== self.id &&
        (member.status ?? "active") === "active" &&
        (!query ||
          member.member_name.toLowerCase().includes(query) ||
          (member.username ?? "").toLowerCase().includes(query))
    );
  }, [directoryQuery.data, search, self.id]);
  const chosen = new Set(selected);
  const full = selected.length >= MEMBERS_MAX;
  const toggle = (id: string) => onChange(chosen.has(id) ? selected.filter((item) => item !== id) : [...selected, id]);

  const row = (id: string, label: string, username?: string) => {
    const checked = chosen.has(id);
    return (
      <label key={id} className="flex min-h-[44px] cursor-pointer items-center gap-3 px-4 py-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-rf-accent"
          checked={checked}
          disabled={!checked && full}
          onChange={() => toggle(id)}
        />
        <span className="min-w-0 flex-1 truncate font-semibold text-rf-text">{label}</span>
        {username && <span className="max-w-[40%] shrink-0 truncate text-xs text-rf-text-muted">@{username}</span>}
      </label>
    );
  };

  if (state.status === "loading") {
    return <p className="text-sm text-rf-text-muted">{ANNOUNCEMENT_COPY.directoryLoading}</p>;
  }
  if (state.status === "failed") {
    return (
      <ErrorView
        error={online ? state.error : appError("offline")}
        onRetry={() => void retryNow(queryClient, ANNOUNCEMENT_KEYS.directory)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={ANNOUNCEMENT_COPY.searchMembers}
        className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
      />
      <div className="flex items-center justify-between text-xs font-semibold text-rf-text-muted">
        <span>{ANNOUNCEMENT_COPY.selectedCount(selected.length)}</span>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="min-h-[44px] px-2 text-rf-accent">
            {ANNOUNCEMENT_COPY.clear}
          </button>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto overscroll-contain rounded-2xl border border-rf-border">
        {self.id && row(self.id, `${ANNOUNCEMENT_COPY.you} (${self.name})`)}
        {visible.map((member) => row(member.id, member.member_name, member.username))}
        {visible.length === 0 && search.trim() && (
          <p className="px-4 py-3 text-sm text-rf-text-muted">{ANNOUNCEMENT_COPY.noMembers}</p>
        )}
      </div>
    </div>
  );
}
