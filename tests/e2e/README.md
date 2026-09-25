# End-to-end tests

These drive the real API routes of a running server against a **local**
database, with outside providers replaced by local fakes. They never talk
to Infobip, a bank or Google, and each script refuses to run if
`DATABASE_URL` isn't a local database.

## WhatsApp OTP (`whatsapp-otp.e2e.ts`)

```bash
# 1. Fake Infobip on :4010
node tests/e2e/fake-infobip.mjs &

# 2. A server pointed at it (a production build on :3200 here)
export INFOBIP_WHATSAPP_BASE_URL=http://127.0.0.1:4010 \
       INFOBIP_WHATSAPP_API_KEY=e2e-fake-key \
       INFOBIP_WHATSAPP_SENDER=+971500000001 \
       INFOBIP_WHATSAPP_AUTH_TEMPLATE=dah_verify \
       INFOBIP_WHATSAPP_AUTH_TEMPLATE_LANGUAGE=en
npm run build && npx next start -p 3200 > /tmp/dah-3200.log 2>&1 &

# 3. The test (same INFOBIP_* exports in this shell)
E2E_SERVER_LOG=/tmp/dah-3200.log npx tsx --require ./tests/setup.cjs tests/e2e/whatsapp-otp.e2e.ts
```

It checks:
- the exact template payload Infobip receives (sender, recipient, template,
  code as body placeholder and Copy Code button);
- that only an HMAC of the code is stored;
- the 5-attempt cap, the resend cooldown and code invalidation on resend;
- the successful verification plus its audit-log row;
- that provider failures are reported honestly;
- that no code or API key ever appears in the delivery log or server log.
