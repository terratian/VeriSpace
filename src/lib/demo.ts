/** The sample-data pages (/demo and /dev-preview) run in development, and in production only when ENABLE_DEMO=1. */
export const demoEnabled = (): boolean => process.env.NODE_ENV !== "production" || process.env.ENABLE_DEMO === "1";
