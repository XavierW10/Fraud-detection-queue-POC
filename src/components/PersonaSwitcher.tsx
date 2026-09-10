'use client';

import { useState, useTransition } from 'react';
import { switchPersona } from '@/app/actions';
import type { UserRole } from '@/db/schema';
import { ROLE_LABELS, initials } from './labels';

export type Persona = { id: string; name: string; role: UserRole };

export function PersonaSwitcher({ personas, current }: { personas: Persona[]; current: Persona }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const select = (id: string) => {
    setOpen(false);
    // The action revalidates the layout, so the header, nav and page data all
    // re-render as the newly chosen user.
    startTransition(() => switchPersona(id));
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch demo persona"
        className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-left hover:bg-slate-50 disabled:opacity-60"
      >
        <span className="grid size-7 place-items-center rounded-full bg-slate-800 text-[11px] font-semibold text-white">
          {initials(current.name)}
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-xs font-medium text-slate-900">{current.name}</span>
          <span className="block text-[11px] text-slate-500">{ROLE_LABELS[current.role]}</span>
        </span>
        <span aria-hidden className="text-slate-400">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-64 rounded-md border border-slate-200 bg-white p-1 shadow-lg"
        >
          <p className="px-2 py-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            Demo persona — act as
          </p>
          {personas.map((persona) => (
            <button
              key={persona.id}
              type="button"
              role="menuitem"
              onClick={() => select(persona.id)}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100"
            >
              <span>
                <span className="block font-medium text-slate-900">{persona.name}</span>
                <span className="block text-[11px] text-slate-500">
                  {ROLE_LABELS[persona.role]}
                </span>
              </span>
              {persona.id === current.id && <span className="text-slate-500">current</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
