"use client";

import { useEffect, useMemo, useState } from "react";

export function useClientSearchParams() {
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSearch(window.location.search || "");
  }, []);

  return useMemo(() => new URLSearchParams(search), [search]);
}
