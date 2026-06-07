"use client";

import { useEffect } from "react";

export function PageTitle({ children }: { children: string }) {
  useEffect(() => {
    document.title = `${children} | toolbox.study`;
  }, [children]);
  return null;
}
