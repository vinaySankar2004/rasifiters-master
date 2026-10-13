"use client";

import { Modal } from "./Modal";

// `closeOnConfirm={false}` (polish #9): the dialog stays open while the caller's action runs. It shows `loadingLabel` on
// the disabled confirm button and the failure in `errorMessage` inside the dialog; the caller closes it on success.
// The default (true) keeps the old close-at-once behavior. While a kept-open action runs, nothing closes the dialog
// (Cancel, Escape, backdrop): its result must land where the user is looking.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  loadingLabel = "Please wait…",
  errorMessage = null,
  closeOnConfirm = true,
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
  loadingLabel?: string;
  errorMessage?: string | null;
  closeOnConfirm?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const locked = !closeOnConfirm && loading;
  return (
    <Modal open={open} onClose={locked ? () => {} : onClose}>
      <div className="modal-surface w-full max-w-md rounded-3xl p-6">
        <h3 className="text-lg font-semibold text-rf-text">{title}</h3>
        <p className="mt-2 text-sm text-rf-text-muted">{description}</p>
        {errorMessage && (
          <p role="alert" className="mt-4 text-sm font-semibold text-rf-danger">
            {errorMessage}
          </p>
        )}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            className="pill-button min-h-[44px] rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              onConfirm();
              if (closeOnConfirm) onClose();
            }}
            className={`min-h-[44px] rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60 ${
              danger ? "danger-pill" : "button-primary button-primary--dark-white"
            }`}
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
