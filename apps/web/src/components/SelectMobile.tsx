"use client";

import { useEffect, useMemo, useState } from "react";

type Option = {
  value: string;
  label: string;
};

type SelectMobileProps = {
  label?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  searchable?: boolean;
};

export function SelectMobile({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder = "Select option",
  className,
  searchable
}: SelectMobileProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    body.classList.add("modal-open");
    return () => {
      body.style.overflow = previousOverflow;
      body.classList.remove("modal-open");
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setSearch("");
  };

  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, search, searchable]);

  return (
    <div className={`relative ${className ?? ""}`}>
      {label && <p className="text-sm font-semibold text-rf-text">{label}</p>}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="input-shell mt-2 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium text-rf-text"
      >
        <span className={`capitalize ${!value ? "text-rf-text-muted" : ""}`}>
          {value ? selected?.label ?? value : placeholder}
        </span>
        <span className={`text-xs ${open ? "rotate-180" : ""} transition`}>⌄</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/40"
            onClick={close}
            aria-hidden
          />
          <div
            className="fixed left-0 right-0 bottom-0 z-[101] flex max-h-[85dvh] flex-col rounded-t-2xl border border-rf-border border-b-0 bg-rf-surface text-rf-text shadow-2xl pb-[env(safe-area-inset-bottom)]"
            role="dialog"
            aria-modal="true"
            aria-label={label ?? "Select option"}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-rf-border px-4 py-3">
              <span className="text-sm font-semibold text-rf-text">
                {label ?? "Select"}
              </span>
              <button
                type="button"
                onClick={close}
                className="rounded-full bg-rf-surface-muted px-3 py-1.5 text-xs font-semibold text-rf-text"
              >
                Done
              </button>
            </div>

            {searchable && (
              <div className="shrink-0 border-b border-rf-border px-4 py-3">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  inputMode="search"
                  placeholder="Search..."
                  className="input-shell w-full rounded-2xl px-4 py-3 text-base font-medium text-rf-text outline-none placeholder:text-rf-text-muted"
                  style={{ fontSize: 16 }}
                />
              </div>
            )}

            <div
              className="min-h-0 flex-1 overflow-auto overscroll-contain py-1"
              style={{
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-y"
              }}
            >
              {filtered.length === 0 ? (
                <p className="px-4 py-3 text-sm text-rf-text-muted">No results</p>
              ) : (
                filtered.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      close();
                    }}
                    className={`flex w-full items-center px-4 py-3 text-left text-sm font-semibold capitalize transition ${
                      option.value === value
                        ? "bg-rf-accent/15 text-rf-text"
                        : "text-rf-text-muted hover:bg-rf-surface-muted"
                    }`}
                  >
                    {option.label}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
