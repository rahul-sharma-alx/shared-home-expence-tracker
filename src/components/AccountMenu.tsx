"use client";

import Image from "next/image";
import { LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type AccountMenuProps = {
  displayName: string;
  email: string | null;
  photoUrl: string | null;
  onOpenProfile: () => void;
  onSignOut: () => void;
};

export function AccountMenu({
  displayName,
  email,
  photoUrl,
  onOpenProfile,
  onSignOut,
}: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const name = displayName.trim() || "Profile";
  const initial = name.charAt(0).toUpperCase();
  const showPhoto = Boolean(photoUrl && photoUrl !== failedPhotoUrl);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open account menu"
        aria-controls={isOpen ? "account-menu-panel" : undefined}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-zinc-200 bg-white p-0.5 shadow-sm transition hover:border-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        {showPhoto && photoUrl ? (
          <Image
            src={photoUrl}
            alt=""
            width={40}
            height={40}
            sizes="40px"
            className="size-full rounded-full object-cover"
            onError={() => setFailedPhotoUrl(photoUrl)}
          />
        ) : (
          <span aria-hidden="true" className="grid size-full place-items-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-800">
            {initial}
          </span>
        )}
      </button>
      {isOpen && (
        <div
          id="account-menu-panel"
          role="group"
          aria-label="Account options"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl"
        >
          <div className="border-b border-zinc-200 px-3 py-2">
            <p className="truncate text-sm font-semibold text-zinc-900">{name}</p>
            {email && <p className="truncate text-xs text-zinc-500">{email}</p>}
          </div>
          <div className="grid gap-1 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenProfile();
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-zinc-50"
            >
              <UserRound size={16} aria-hidden="true" />
              Profile
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onSignOut();
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
