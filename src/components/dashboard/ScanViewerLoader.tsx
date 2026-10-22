"use client";

import dynamic from "next/dynamic";

export const ScanViewerLoader = dynamic(() => import("./ScanViewer"), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full rounded-[14px] border border-edge bg-graphite sm:h-[520px]" aria-hidden="true" />,
});
