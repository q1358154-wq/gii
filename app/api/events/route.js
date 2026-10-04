import { runAgents } from "../../../lib/agents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const encoder = new TextEncoder();

  let stopped = false;
  let timer = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) => {
        if (stopped) return;

        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify(
              data
            )}\n\n`
          )
        );
      };

      const close = () => {
        stopped = true;

        if (timer) {
          clearTimeout(timer);
          timer = null;
        }

        try {
          controller.close();
        } catch {
          // stream already closed
        }
      };

      const loop = async () => {
        if (stopped) return;

        try {
          const state = await runAgents();

          send("state", state);
          send("heartbeat", {
            timestamp: Date.now(),
            status: "LIVE",
          });
        } catch (error) {
          console.error(
            "SSE agent loop error:",
            error
          );

          send("error", {
            timestamp: Date.now(),
            message:
              "Live market analysis temporarily unavailable.",
          });
        }

        if (!stopped) {
          timer = setTimeout(loop, 5000);
        }
      };

      send("connected", {
        timestamp: Date.now(),
        stream: "Crypto AI OS Event Stream",
        mode: "PAPER",
      });

      loop();

      request.signal.addEventListener(
        "abort",
        close
      );
    },

    cancel() {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}