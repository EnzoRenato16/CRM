"use client";

import { useEffect, useState } from "react";
import { CardGrid } from "@/components/cards/CardRenderer";
import type { AssistantResponse } from "@/lib/cards/schema";
import {
  catalogFor,
  loadBoard,
  saveBoard,
  newId,
  type BoardItem,
  type BoardRole,
  type CatalogEntry,
} from "@/lib/board";

export function BoardView({ role, userEmail }: { role: BoardRole; userEmail: string }) {
  const [items, setItems] = useState<BoardItem[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const catalog = catalogFor(role);

  useEffect(() => {
    setItems(loadBoard(userEmail));
  }, [userEmail]);

  function persist(next: BoardItem[]) {
    setItems(next);
    saveBoard(userEmail, next);
  }

  async function add(entry: CatalogEntry) {
    if (adding) return;
    setAdding(entry.id);
    setError(null);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: entry.question }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível adicionar o card.");
        return;
      }
      const r = data as AssistantResponse;
      persist([...items, { id: newId(), label: entry.label, tool: r.meta.tool, cards: r.cards }]);
      setPickerOpen(false);
    } catch {
      setError("Erro de rede ao adicionar o card.");
    } finally {
      setAdding(null);
    }
  }

  function remove(id: string) {
    persist(items.filter((i) => i.id !== id));
  }

  function move(id: string, dir: -1 | 1) {
    const idx = items.findIndex((i) => i.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    persist(next);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Meu Painel</h1>
          <p className="text-sm text-ink-500">
            Monte o seu dashboard com cards prontos — persiste no seu navegador.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Adicionar card
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {(pickerOpen || items.length === 0) && (
        <div className="mt-4 rounded-xl border border-ink-200 bg-white p-4 shadow-card dark:border-ink-800 dark:bg-ink-900">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-400">
            Cards prontos {role === "manager" ? "(gestor)" : "(assessor)"}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => add(entry)}
                disabled={adding !== null}
                className="flex items-start gap-3 rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-left transition hover:border-brand-400 hover:bg-brand-50/50 disabled:opacity-60 dark:border-ink-800 dark:bg-ink-900 dark:hover:border-brand-500"
              >
                <span className="mt-0.5 text-brand-500">
                  {adding === entry.id ? <Spinner /> : <Plus />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{entry.label}</span>
                  <span className="block text-xs text-ink-500">{entry.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="mt-6 text-center text-sm text-ink-400">
          Seu painel está vazio. Adicione cards acima, ou fixe respostas direto do Copilot.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {items.map((item, i) => (
            <section
              key={item.id}
              className="rounded-xl border border-ink-200 bg-ink-50/40 p-4 dark:border-ink-800 dark:bg-ink-950/30"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-tight">{item.label}</h2>
                <div className="flex items-center gap-1">
                  <IconButton label="Mover para cima" disabled={i === 0} onClick={() => move(item.id, -1)}>
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </IconButton>
                  <IconButton label="Mover para baixo" disabled={i === items.length - 1} onClick={() => move(item.id, 1)}>
                    <path d="M12 5v14M19 12l-7 7-7-7" />
                  </IconButton>
                  <IconButton label="Remover card" onClick={() => remove(item.id)}>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </IconButton>
                </div>
              </div>
              <CardGrid cards={item.cards} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30 dark:hover:bg-ink-800 dark:hover:text-ink-200"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

function Plus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
