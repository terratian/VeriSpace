"use client";

import dynamic from "next/dynamic";

// Three.js is large and needs the browser, so it loads only when this view is opened.
export const PropertyViewerLoader = dynamic(() => import("./PropertyViewer"), {
  ssr: false,
  loading: () => <div className="h-[380px] w-full rounded-[14px] border border-edge bg-graphite sm:h-[440px]" aria-hidden="true" />,
});
