"use client";

import { Modal } from "./Modal";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  onConfirm,
  onClose
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-surface w-full max-w-md rounded-3xl p-6">
        <h3 className="text-lg font-semibold text-rf-text">{title}</h3>
        <p className="mt-2 text-sm text-rf-text-muted">{description}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            className="pill-button rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
              danger ? "danger-pill" : "button-primary button-primary--dark-white"
            }`}
          >
            {loading ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
