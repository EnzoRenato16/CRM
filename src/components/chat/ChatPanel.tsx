"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistantResponse } from "@/lib/cards/schema";
import { CardGrid } from "@/components/cards/CardRenderer";
import { renderInlineMarkdown } from "@/components/cards/markdown";
import { printReport } from "@/lib/report";

type Message =
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "assistant"; response: AssistantResponse }
  | { id: number; kind: "error"; text: string };

interface Props {
  userName: string;
  role: "advisor" | "manager";
  scopeLabel: string;
  suggestions: string[];
  llmEngine: "anthropic" | "rule-based";
}

export function ChatPanel({ userName, role, scopeLabel, suggestions, llmEngine }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const userMsg: Message = { id: seq.current++, kind: "user", text: q };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [...m, { id: seq.current++, kind: "error", text: data.error ?? "Erro." }]);
      } else {
        setMessages((m) => [...m, { id: seq.current++, kind: "assistant", response: data as AssistantResponse }]);
      }
    } catch {
      setMessages((m) => [...m, { id: seq.current++, kind: "error", text: "Erro de rede." }]);
    } finally {
      setLoading(false);
      // Return focus to the composer so keyboard users can keep asking.
      inputRef.current?.focus();
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div
          className="mx-auto w-full max-w-5xl px-4 py-6"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-label="Conversa com o copiloto"
        >
          {empty ? (
            <EmptyState userName={userName} role={role} suggestions={suggestions} onPick={send} />
          ) : (
            <div className="space-y-6">
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const question = m.kind === "assistant" && prev?.kind === "user" ? prev.text : undefined;
                return (
                  <MessageView
                    key={m.id}
                    message={m}
                    scopeLabel={scopeLabel}
                    userName={userName}
                    question={question}
                  />
                );
              })}
              {loading && <Thinking />}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-ink-200 bg-ink-50/80 backdrop-blur dark:border-ink-800 dark:bg-ink-950/70">
        <div className="mx-auto w-full max-w-5xl px-4 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2"
          >
            <div className="flex-1 rounded-xl border border-ink-200 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/20 dark:border-ink-700 dark:bg-ink-900">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  role === "manager"
                    ? "Pergunte sobre a mesa: faturamento, ranking, captação…"
                    : "Pergunte sobre a sua carteira: alocação, captação, clientes…"
                }
                className="w-full bg-transparent px-4 py-3 text-sm outline-none"
                maxLength={500}
                ref={inputRef}
                aria-label="Escreva a sua pergunta"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex h-[46px] items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Enviar
            </button>
          </form>
          <p className="mt-2 text-center text-xs text-ink-400">
            {scopeLabel} · motor de IA:{" "}
            <span className="font-medium">
              {llmEngine === "anthropic" ? "Anthropic (tool-calling)" : "roteador determinístico (offline)"}
            </span>{" "}
            · segurança imposta no servidor
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  userName,
  role,
  suggestions,
  onPick,
}: {
  userName: string;
  role: "advisor" | "manager";
  suggestions: string[];
  onPick: (s: string) => void;
}) {
  const first = userName.split(" ")[0];
  return (
    <div className="mx-auto max-w-2xl pt-8 text-center">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M4 15l4-4 3 3 5-6 4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Olá, {first} 👋</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
        {role === "manager"
          ? "Você está no modo gestor: pergunte sobre a equipe, receita, comissões e ranking. O copiloto monta os cards na hora."
          : "Pergunte sobre a sua carteira em português. O copiloto desenha os cards e gráficos automaticamente — e nunca expõe comissões."}
      </p>
      <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="group flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-3 text-left text-sm transition hover:border-brand-400 hover:shadow-card dark:border-ink-800 dark:bg-ink-900 dark:hover:border-brand-500"
          >
            <span className="text-brand-500">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="flex-1">{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageView({
  message,
  scopeLabel,
  userName,
  question,
}: {
  message: Message;
  scopeLabel: string;
  userName: string;
  question?: string;
}) {
  if (message.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm text-white shadow-sm">
          {message.text}
        </div>
      </div>
    );
  }
  if (message.kind === "error") {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-300">
        {message.text}
      </div>
    );
  }
  const { response } = message;
  return (
    <div className="space-y-3">
      {response.narrative && (
        <div className="flex items-start gap-3">
          <Avatar />
          <div className="rounded-2xl rounded-tl-md border border-ink-200 bg-white px-4 py-2.5 text-sm leading-relaxed shadow-sm dark:border-ink-800 dark:bg-ink-900">
            {renderInlineMarkdown(response.narrative)}
          </div>
        </div>
      )}
      <div className="sm:pl-11">
        <CardGrid cards={response.cards} />
        {response.meta.tool !== "help" && response.meta.tool !== "access_denied" && (
          <div className="mt-2 flex items-center gap-3">
            <p className="text-[11px] text-ink-400">
              gerado por IA · ferramenta <code className="rounded bg-ink-100 px-1 dark:bg-ink-800">{response.meta.tool}</code>
            </p>
            <button
              type="button"
              onClick={() => printReport(response, { scopeLabel, userName, userQuestion: question })}
              className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-500 transition hover:border-brand-400 hover:text-brand-600 dark:border-ink-700 dark:hover:border-brand-500"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v8H6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Exportar PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M4 15l4-4 3 3 5-6 4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-3" role="status" aria-label="Gerando resposta">
      <Avatar />
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md border border-ink-200 bg-white px-4 py-3 shadow-sm dark:border-ink-800 dark:bg-ink-900">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
        <span className="sr-only">Gerando resposta…</span>
      </div>
    </div>
  );
}
