"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { logoutAction } from "@/app/actions";
import { ReviewBadge } from "./review-badge";

const allLinks = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/review", label: "Review", icon: "review" },
  { href: "/transactions", label: "All", icon: "list" },
  { href: "/monthly", label: "Monthly", icon: "monthly" },
  { href: "/loans", label: "Loans", icon: "loans" },
  { href: "/investments", label: "Investments", icon: "investments" },
  { href: "/installments", label: "Recurring", icon: "installments" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

const bottomTabs = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/add", label: "Add", icon: "add" },
  { href: "/review", label: "Review", icon: "review" },
];

function Icon({ name }: { name: string }) {
  const style = "h-5 w-5 shrink-0";
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={style}>
          <path d="M3 12l9-9 9 9M5 10v10h14V10" />
        </svg>
      );
    case "add":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={style}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "review":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={style}>
          <path d="M21 8v4a4 4 0 01-2 3.46l-6 3.5a4 4 0 01-4 0l-6-3.5A4 4 0 013 12V8a4 4 0 012-3.46l6-3.5a4 4 0 014 0l6 3.5A4 4 0 0121 8z" />
        </svg>
      );
    case "monthly":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={style}>
          <path d="M3 8l9 5 9-5v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
      );
    case "loans":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={style}>
          <path d="M12 5v14M5 12h14" />
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      );
    case "investments":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={style}>
          <path d="M12 2l8 8v8a4 4 0 01-8 2 4 4 0 01-8-2V10z" />
        </svg>
      );
    case "installments":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={style}>
          <path d="M3 7h18M3 12h18M3 17h18" />
        </svg>
      );
    case "list":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={style}>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={style}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v6m0 10v6M4.22 4.22l4.24 4.24m7.08 7.08l4.24 4.24M1 12h6m11 0h6" />
        </svg>
      );
    default:
      return null;
  }
}

const themeListeners = new Set<() => void>();

function subscribeTheme(onChange: () => void) {
  themeListeners.add(onChange);
  return () => themeListeners.delete(onChange);
}

function isDarkNow(): boolean {
  return document.documentElement.classList.contains("dark");
}

function ThemeToggle() {
  // Reads the <html> class (set pre-paint by the root-layout inline script).
  // Server snapshot = false → neutral icon placeholder until hydration.
  const dark = useSyncExternalStore(subscribeTheme, isDarkNow, () => false);
  const reduce = useReducedMotion();

  const toggle = () => {
    const next = !isDarkNow();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    themeListeners.forEach((cb) => cb());
  };

  return (
    <motion.button
      type="button"
      aria-label="Toggle theme"
      title="Toggle theme"
      onClick={toggle}
      whileTap={reduce ? undefined : { scale: 0.92, rotate: 18 }}
      transition={{ duration: 0.1 }}
      className="rounded-full p-3 text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={dark ? "sun" : "moon"}
          initial={reduce ? false : { opacity: 0, rotate: -90, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={reduce ? undefined : { opacity: 0, rotate: 90, scale: 0.6 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="flex"
        >
          {dark ? (
            // Sun (currently dark → switch to light)
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            // Moon (currently light → switch to dark)
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.button>
  );
}

export function AppNav({ reviewCount }: { reviewCount: number }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const reduce = useReducedMotion();

  const currentTab = bottomTabs.find((t) => pathname === t.href);

  return (
    <>
      {/* Compact top bar — mobile only (<640px). Desktop uses the sidebar. */}
      <nav className="sticky top-0 z-40 border-b border-outline-variant bg-surface-container-lowest pt-[env(safe-area-inset-top)] sm:hidden">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/"
            className="shrink-0 text-xl font-semibold text-on-surface hover:opacity-80"
          >
            Finance Tracker
          </Link>

          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <motion.button
              type="button"
              aria-label="Menu"
              onClick={() => setDrawerOpen(true)}
              whileTap={reduce ? undefined : { scale: 0.9 }}
              transition={{ duration: 0.1 }}
              className="rounded-full p-3 text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-5 w-5"
              >
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </motion.button>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-full px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </nav>

      {/* Desktop sidebar (≥640px) — fixed left rail with all links, theme
          toggle and logout pinned to the bottom. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col border-r border-outline-variant bg-surface-container-lowest sm:flex">
        <div className="px-4 pb-2 pt-5">
          <Link
            href="/"
            className="block truncate text-xl font-semibold text-on-surface hover:opacity-80"
          >
            Finance Tracker
          </Link>
        </div>
        <div className="px-4 pb-2">
          <Link
            href="/add"
            className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-on-primary hover:opacity-90 active:opacity-70"
          >
            + Add Transaction
          </Link>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-2">
          {allLinks.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                title={l.label}
                className={`flex shrink-0 items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium ${
                  active
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
                }`}
              >
                <Icon name={l.icon} />
                {l.label}
                {l.href === "/review" && <ReviewBadge count={reviewCount} />}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center gap-2 border-t border-outline-variant p-3">
          <ThemeToggle />
          <form action={logoutAction} className="min-w-0 flex-1">
            <button
              type="submit"
              className="w-full truncate rounded-lg px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
            >
              Log out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile bottom tab bar — visible only below 640px */}
      <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant bg-surface-container-lowest pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_8px_rgba(0,0,0,0.08)]">
        <div className="mx-auto flex w-full max-w-3xl justify-around">
          {bottomTabs.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative flex flex-col items-center gap-1 rounded-t-lg px-2 py-2.5 text-xs font-medium ${
                  active
                    ? "text-on-surface"
                    : "text-on-surface-variant hover:text-on-surface active:text-on-surface"
                }`}
              >
                <div className="relative">
                  <Icon name={l.icon} />
                  {l.href === "/review" && reviewCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-error px-1 text-[9px] font-semibold leading-none text-white">
                      {reviewCount > 99 ? "99+" : reviewCount}
                    </span>
                  )}
                </div>
                {l.label}
                {active && currentTab && (
                  <motion.div
                    layoutId="bottom-tab-active"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 35 }}
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                  />
                )}
              </Link>
            );
          })}
          <motion.button
            type="button"
            aria-label="Menu"
            onClick={() => setDrawerOpen(true)}
            whileTap={reduce ? undefined : { scale: 0.9 }}
            transition={{ duration: 0.1 }}
            className={`flex flex-col items-center gap-1 rounded-t-lg px-2 py-2.5 text-xs font-medium ${
              allLinks.some(
                (l) =>
                  pathname === l.href &&
                  !bottomTabs.some((b) => b.href === l.href)
              )
                ? "text-on-surface"
                : "text-on-surface-variant hover:text-on-surface active:text-on-surface"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-5 w-5"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            Menu
          </motion.button>
        </div>
      </div>

      {/* Drawer / sheet — all screen sizes, triggered by hamburger + Menu tab */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            key="drawer-backdrop"
            className="fixed inset-0 z-50 flex items-start justify-end bg-black/60"
            onClick={() => setDrawerOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <motion.div
              key="drawer-panel"
              className="h-full w-64 max-w-xs overflow-y-auto border-l border-outline-variant bg-surface-container-lowest p-2 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[env(safe-area-inset-bottom)] shadow-xl"
              onClick={(e) => e.stopPropagation()}
              initial={reduce ? false : { x: "100%" }}
              animate={{ x: 0 }}
              exit={reduce ? undefined : { x: "100%" }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="flex flex-col gap-1 px-2">
                {allLinks.map((l) => {
                  const active = pathname === l.href;
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setDrawerOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                        active
                          ? "bg-primary text-on-primary"
                          : "text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
                      }`}
                    >
                      <Icon name={l.icon} />
                      {l.label}
                      {l.href === "/review" && <ReviewBadge count={reviewCount} />}
                    </Link>
                  );
                })}
                <form action={logoutAction} className="mt-2">
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high"
                  >
                    Log out
                  </button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
