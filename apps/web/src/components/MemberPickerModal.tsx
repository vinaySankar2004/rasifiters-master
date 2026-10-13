"use client";

import { useState } from "react";
import type { Member } from "@/lib/api/programs";
import { Modal } from "@/components/ui/Modal";

// The shared "View as" member picker (polish #36: 44 px rows + a selected state). Extracted from the Lifestyle tab;
// the Members tab adopts it in People S5.
export function MemberPickerModal({
  open,
  members,
  selected,
  allowNone,
  noneLabel,
  onClose,
  onSelect
}: {
  open: boolean;
  members: Member[];
  selected: Member | null;
  allowNone: boolean;
  noneLabel: string;
  onClose: () => void;
  onSelect: (member: Member | null) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = members.filter((member) =>
    member.member_name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const rowClass =
    "flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition hover:bg-rf-surface-muted";

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-surface w-full max-w-lg rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-rf-text">View as</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center rounded-full bg-rf-surface-muted px-4 text-sm font-semibold text-rf-text-muted"
          >
            Done
          </button>
        </div>
        <div className="mt-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search member"
            aria-label="Search member"
            className="input-shell w-full rounded-2xl px-4 py-3 text-sm font-medium"
          />
        </div>
        <div
          className="mt-4 max-h-[min(70vh,20rem)] overflow-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        >
          {allowNone && (
            <button
              type="button"
              aria-pressed={selected === null}
              onClick={() => onSelect(null)}
              className={`${rowClass} ${selected === null ? "text-rf-text" : "text-rf-text-muted"}`}
            >
              <span>{noneLabel}</span>
              {selected === null && <span aria-hidden="true" className="text-rf-accent">✓</span>}
            </button>
          )}
          {filtered.map((member) => (
            <button
              key={member.id}
              type="button"
              aria-pressed={selected?.id === member.id}
              onClick={() => onSelect(member)}
              className={`${rowClass} text-rf-text`}
            >
              <span className="min-w-0 truncate">{member.member_name}</span>
              {selected?.id === member.id && <span aria-hidden="true" className="text-rf-accent">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
