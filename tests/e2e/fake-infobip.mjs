// A local stand-in for Infobip's WhatsApp API, for end-to-end tests only.
// It implements just the two endpoints lib/whatsapp/infobip.ts calls
// (template list + template send), records every request so a test can
// assert on exactly what the app sent, and never talks to the internet.
//
//   node tests/e2e/fake-infobip.mjs            # listens on :4010 (FAKE_INFOBIP_PORT)
//
// Test controls (not part of Infobip's API):
//   GET  /__requests   -> recorded requests
//   POST /__reset      -> clear them
//   POST /__fail-next  -> the next send returns 500 and echoes the payload,
//                         to check the app redacts codes from its logs
import http from "node:http";

const port = Number(process.env.FAKE_INFOBIP_PORT || 4010);
let requests = [];
let failNext = false;
let seq = 0;

const TEMPLATES = {
  templates: [
    {
      name: "dah_verify",
      language: "en",
      category: "AUTHENTICATION",
      status: "APPROVED",
      structure: { body: { text: "{{1}} is your verification code." }, buttons: [{ type: "URL", text: "Copy code" }] },
    },
    {
      name: "dah_booking_confirmed",
      language: "en",
      category: "UTILITY",
      status: "APPROVED",
      structure: { body: { text: "Hi {{1}}, your booth {{2}} at {{3}} is confirmed." } },
    },
  ],
};

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url, `http://localhost:${port}`);
      if (url.pathname === "/__requests") return send(res, 200, requests);
      if (url.pathname === "/__reset") {
        requests = [];
        failNext = false;
        return send(res, 200, { ok: true });
      }
      if (url.pathname === "/__fail-next") {
        failNext = true;
        return send(res, 200, { ok: true });
      }

      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = raw;
      }
      requests.push({ method: req.method, path: url.pathname, authorization: req.headers.authorization ?? null, body });

      if (req.method === "GET" && /^\/whatsapp\/1\/senders\/[^/]+\/templates$/.test(url.pathname)) return send(res, 200, TEMPLATES);
      if (req.method === "POST" && url.pathname === "/whatsapp/1/message/template") {
        if (failNext) {
          failNext = false;
          // Like some real provider errors, echo the submitted payload back.
          return send(res, 500, { requestError: { serviceException: { text: `Rejected: ${raw}` } } });
        }
        const to = body?.messages?.[0]?.to;
        return send(res, 200, { messages: [{ messageId: `fake-${++seq}`, to, status: { groupName: "PENDING" } }] });
      }
      send(res, 404, { error: "not implemented in fake" });
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`fake infobip on :${port}`));
