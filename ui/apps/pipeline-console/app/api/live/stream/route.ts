/**
 * SSE source for the live pipeline. On connect:
 *
 *   1. Send `snapshot` — the most recent 100 application_state rows.
 *   2. Open a dedicated pg client and `LISTEN application_state_changed`.
 *   3. On every notification, re-query that row + its 5 most recent events
 *      and push as `state_changed` to the client.
 *   4. Heartbeat ping every 25s as a comment frame so middleware/proxies
 *      don't kill an idle connection.
 *   5. Tear everything down on client disconnect (request abort).
 *
 * Note: this route runs on the Node runtime — `pg` requires Node, not Edge.
 */

import { getActiveCases, getCase, getRecentEvents } from "@uc/lib/live-data";
import { getPool, isDbConfigured, DB_UNAVAILABLE_MESSAGE } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;
const SNAPSHOT_LIMIT = 100;
const RECENT_EVENTS = 5;

type Frame =
  | { event: "snapshot"; data: unknown }
  | { event: "state_changed"; data: unknown };

function encodeFrame(f: Frame): string {
  return `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`;
}

export async function GET(req: Request): Promise<Response> {
  if (!isDbConfigured()) {
    return new Response(JSON.stringify({ error: DB_UNAVAILABLE_MESSAGE }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const pool = getPool();
  // A dedicated client for LISTEN — it stays checked out for the connection
  // lifetime so notifications stream on this exact socket.
  let listenClient: import("pg").PoolClient | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed by aborted client — ignore.
        }
      };

      const teardown = async () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        try {
          if (listenClient) {
            try {
              await listenClient.query("UNLISTEN application_state_changed");
            } catch {
              // ignore
            }
            listenClient.release();
          }
        } finally {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      };

      // Abort signal from the browser disconnect — Next.js threads it onto
      // the request. We wire it before any awaits so disconnects mid-bootstrap
      // still clean up.
      req.signal.addEventListener("abort", () => {
        void teardown();
      });

      // 1) Initial snapshot.
      try {
        const cases = await getActiveCases(SNAPSHOT_LIMIT);
        safeEnqueue(encodeFrame({ event: "snapshot", data: { cases } }));
      } catch (e) {
        safeEnqueue(`: snapshot-error ${(e as Error).message}\n\n`);
      }

      // 2) LISTEN on a dedicated client.
      try {
        listenClient = await pool.connect();
        await listenClient.query("LISTEN application_state_changed");
        listenClient.on("notification", async (msg) => {
          if (closed) return;
          if (msg.channel !== "application_state_changed" || !msg.payload) return;
          try {
            const [state, events] = await Promise.all([
              getCase(msg.payload),
              getRecentEvents(msg.payload, RECENT_EVENTS),
            ]);
            if (!state) return;
            safeEnqueue(
              encodeFrame({
                event: "state_changed",
                data: { case: state, recent_events: events },
              }),
            );
          } catch (e) {
            safeEnqueue(`: notify-error ${(e as Error).message}\n\n`);
          }
        });
        // The client emits 'error' if the underlying connection drops; surface
        // it as an SSE error frame and tear down so the browser reconnects.
        listenClient.on("error", (err) => {
          safeEnqueue(`: listen-error ${err.message}\n\n`);
          void teardown();
        });
      } catch (e) {
        safeEnqueue(`: listen-bootstrap-error ${(e as Error).message}\n\n`);
        // Even if LISTEN failed, keep the stream open so the client at least
        // got the snapshot; teardown will fire on disconnect.
      }

      // 3) Heartbeat — comment frames keep proxies from idling us out.
      heartbeat = setInterval(() => {
        safeEnqueue(`: ping ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);
    },
    async cancel() {
      // ReadableStream cancel — happens when the consumer disconnects too.
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (listenClient) {
        try {
          await listenClient.query("UNLISTEN application_state_changed");
        } catch {
          // ignore
        }
        listenClient.release();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
