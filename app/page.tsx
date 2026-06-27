"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { runAgentAction } from "./actions";
import type { RunResult } from "@/lib/orchestrator";

interface Deal {
  recordId: string;
  name: string;
  stage: string;
  contactName: string;
  contactPhone: string;
  companyName: string;
  agentStatus: string;
  lastCallOutcome: string;
  nextStep: string;
  lastActivity: string | null;
}

interface CandidatesResponse {
  deals: Deal[];
  next_pick_record_id: string | null;
}

const STAGE_STYLES: Record<string, string> = {
  New: "bg-sky-500/10 text-sky-700 ring-sky-500/20",
  Contacted: "bg-amber-500/10 text-amber-700 ring-amber-500/20",
  "Meeting Booked": "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  Won: "bg-emerald-500/15 text-emerald-800 ring-emerald-500/30",
  Lost: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
};

const AGENT_STYLES: Record<string, string> = {
  idle: "text-zinc-400",
  calling: "text-amber-600 animate-pulse",
  done: "text-emerald-600",
};

function daysAgo(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "today" : `${days}d ago`;
}

export default function Dashboard() {
  const [data, setData] = useState<CandidatesResponse | null>(null);
  const [phoneOverride, setPhoneOverride] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/candidates", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* keep last good state */
    }
  }, []);

  useEffect(() => {
    const tick = () => void refresh();
    const first = setTimeout(tick, 0); // initial load off the effect's sync path
    const id = setInterval(tick, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refresh]);

  function runAgent(recordId?: string) {
    startTransition(async () => {
      const r = await runAgentAction({
        recordId,
        phoneOverride: phoneOverride.trim() || undefined,
      });
      setResult(r);
      refresh();
    });
  }

  const deals = data?.deals ?? [];
  const nextId = data?.next_pick_record_id ?? null;

  // Derive (don't store) whether the "Calling…" banner should still show: hide it
  // once the dispatched deal flips to "done" — call_end has written the outcome
  // back to Attio and the table row now reflects it.
  const callFinished =
    result?.status === "dispatched" &&
    deals.some(
      (d) => d.recordId === result.deal.recordId && d.agentStatus === "done",
    );
  const visibleResult = callFinished ? null : result;

  return (
    <main className="min-h-screen w-full bg-[#fafafa] px-6 py-10 text-zinc-900">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              AutoCloser
            </h1>
            <p className="text-sm text-zinc-500">
              Autonomous voice SDR - picks the stalest deal, calls it, books the
              meeting, writes it back to Attio.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={phoneOverride}
              onChange={(e) => setPhoneOverride(e.target.value)}
              placeholder="phone override +44…"
              className="w-44 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
            />
            <button
              onClick={() => runAgent()}
              disabled={pending}
              className="rounded-md bg-emerald-400 px-4 py-2 text-sm font-medium text-black transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {pending ? "Dispatching…" : "Run agent"}
            </button>
          </div>
        </header>

        {visibleResult && <ResultBanner result={visibleResult} />}

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-emerald-500/5 text-xs uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-4 py-3 font-medium">Deal</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Last activity</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {deals.map((d) => {
                const isNext = d.recordId === nextId;
                return (
                  <tr key={d.recordId}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-zinc-900">
                        {d.name}
                        {isNext && (
                          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 ring-1 ring-emerald-500/20">
                            next
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {d.contactName} · {d.contactPhone}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ring-1 ${
                          STAGE_STYLES[d.stage] ??
                          "bg-zinc-100 text-zinc-600 ring-zinc-200"
                        }`}
                      >
                        {d.stage || "—"}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 text-xs font-medium ${AGENT_STYLES[d.agentStatus] ?? "text-zinc-400"}`}
                    >
                      {d.agentStatus || "idle"}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {daysAgo(d.lastActivity)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => runAgent(d.recordId)}
                        disabled={pending}
                        className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-emerald-500/40 hover:text-zinc-900 disabled:opacity-50"
                      >
                        Call
                      </button>
                    </td>
                  </tr>
                );
              })}
              {deals.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm text-zinc-500"
                  >
                    No deals. Run{" "}
                    <code className="text-zinc-600">
                      scripts/setup-attio.ts
                    </code>{" "}
                    to seed the pipeline.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-zinc-400">
          Auto-refreshing every 3s · pipeline lives in Attio.
        </p>
      </div>
    </main>
  );
}

function ResultBanner({ result }: { result: RunResult }) {
  const tone =
    result.status === "dispatched"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800"
      : result.status === "idle"
        ? "border-zinc-200 bg-white text-zinc-600"
        : "border-rose-500/30 bg-rose-500/10 text-rose-800";

  return (
    <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${tone}`}>
      {result.status === "dispatched" && (
        <>
          <div className="font-medium">
            📞 Calling {result.deal.name} at {result.deal.phone}
          </div>
          <div className="mt-1 text-xs opacity-80">
            call_id {result.callId} · talking points:{" "}
            {result.talkingPoints.slice(0, 140)}…
          </div>
        </>
      )}
      {result.status === "idle" && (
        <span>No actionable deal right now ({result.reason}).</span>
      )}
      {result.status === "error" && <span>⚠️ {result.error}</span>}
    </div>
  );
}
