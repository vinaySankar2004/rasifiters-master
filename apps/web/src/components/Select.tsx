"use client";

import { SelectMobile } from "@/components/SelectMobile";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Option = {
  value: string;
  label: string;
};

type SelectProps = {
  label?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  searchable?: boolean;
};

export function Select({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder = "Select option",
  className,
  searchable
}: SelectProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <SelectMobile
        label={label}
        value={value}
        options={options}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        searchable={searchable}
      />
    );
  }
  return (
    <SelectDesktop
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      searchable={searchable}
    />
  );
}

function SelectDesktop({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder = "Select option",
  className,
  searchable
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handler = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      const insideWrapper = wrapperRef.current?.contains(event.target) ?? false;
      const insideDropdown = dropdownRef.current?.contains(event.target) ?? false;
      if (!insideWrapper && !insideDropdown) {
        setOpen(false);
        setSearch("");
      }
    };

    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      setSearch("");
    };
    const handleScroll = (event: Event) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && dropdownRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

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

  useEffect(() => {
    if (!open || !searchable) return;
    const t = setTimeout(() => searchRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [open, searchable]);

  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, search, searchable]);

  const rect = open && wrapperRef.current ? wrapperRef.current.getBoundingClientRect() : null;

  const placement =
    rect && typeof window !== "undefined"
      ? (() => {
          const GAP = 8;
          const spaceBelow = window.innerHeight - rect.bottom - GAP;
          const spaceAbove = rect.top - GAP;
          const placeAbove = spaceBelow < Math.max(200, spaceAbove);
          const maxHeight = placeAbove
            ? Math.min(window.innerHeight * 0.7, spaceAbove - GAP)
            : Math.min(window.innerHeight * 0.7, spaceBelow - GAP);
          return { placeAbove, maxHeight };
        })()
      : null;

  const dropdownPanel = rect && placement && (
    <div
      ref={dropdownRef}
      className="fixed z-[100] flex flex-col rounded-2xl border border-rf-border bg-rf-surface text-rf-text shadow-2xl"
      style={{
        left: rect.left,
        ...(placement.placeAbove
          ? { bottom: window.innerHeight - rect.top + 8 }
          : { top: rect.bottom + 8 }),
        width: rect.width,
        minWidth: 120,
        maxHeight: placement.maxHeight
      }}
    >
      {searchable && (
        <div className="shrink-0 border-b border-rf-border px-3 py-2">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onPointerDown={(e) => e.currentTarget.focus()}
            inputMode="search"
            placeholder="Search..."
            className="w-full bg-transparent text-base font-medium text-rf-text outline-none placeholder:text-rf-text-muted sm:text-sm"
          />
        </div>
      )}
      <div
        className="min-h-0 flex-1 touch-pan-y overflow-auto overscroll-contain py-1"
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
                setOpen(false);
                setSearch("");
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
  );

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ""}`}>
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

      {open && typeof document !== "undefined" && createPortal(dropdownPanel, document.body)}
    </div>
  );
}
