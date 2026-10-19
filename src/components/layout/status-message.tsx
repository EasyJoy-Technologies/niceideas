import type { ReactNode } from "react";

type Props = { title: string; body: string; action?: ReactNode };

/** Centered status card used by not-found / error screens. */
export function StatusMessage({ title, body, action }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16 text-center">
      <div className="rounded-lg bg-surface p-8 shadow-card">
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        <p className="mt-3 text-base text-ink-muted">{body}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </main>
  );
}
