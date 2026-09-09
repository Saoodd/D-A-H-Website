"use client";

import { useEffect } from "react";

/** Fires the browser's print/save-as-PDF dialog once, on mount — what
 *  actually makes "Download Receipt" download rather than just opening the
 *  same page a "View Receipt" click would. */
export function AutoPrint() {
  useEffect(() => {
    window.print();
  }, []);
  return null;
}
