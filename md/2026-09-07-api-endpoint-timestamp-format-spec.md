# API Endpoint Timestamp & Date Format Spec

**Date:** 2026-09-07
**Audience:** External / partner software that sends values to the platform's Workflow v2 **API Endpoint** step or the **Extraction → API Call** step.
**Applies to:** field values whose configured `dataType` is `date` or `datetime` on a Request Body Field Mapping.

---

## 1. Where this formatting happens

The same normalization logic runs in two places:

| Where | File / step |
|---|---|
| Workflow v2 → API Endpoint step | `supabase/functions/json-workflow-processor-v2/steps/apiEndpoint.ts` |
| Extraction → API Call step | `supabase/functions/json-workflow-processor-v2/steps/api.ts` |

For every mapping in `requestBodyFieldMappings`, the value the mapping resolves to is coerced according to its `dataType` before being written into the JSON body sent to the target API.

There is **no timezone conversion** and **no offset/`Z` suffix** — the value is treated as a local, naive timestamp.

---

## 2. `datetime` — the rule the platform applies

Given the resolved value (converted to a string), the platform checks it against two patterns, in this exact order:

1. `YYYY-MM-DDTHH:MM` (exactly this shape — no seconds, no timezone)
   → appends `:00`
   → sent as **`YYYY-MM-DDTHH:MM:SS`**

2. `YYYY-MM-DD` (date only)
   → appends `T00:00:00`
   → sent as **`YYYY-MM-DDT00:00:00`**

3. Anything else
   → sent through **unchanged** (as a string)

That is the entire logic. It does not parse, it does not reformat, it does not add a timezone. If you send `2026-09-07T14:30:00Z`, it is forwarded as `2026-09-07T14:30:00Z`. If you send `09/07/2026 2:30 PM`, it is forwarded as `09/07/2026 2:30 PM`.

### What your software should send

To land on the platform's canonical output shape without relying on the fallback, send one of:

- **`YYYY-MM-DDTHH:MM`** — recommended for wall-clock timestamps. The platform will complete it to `YYYY-MM-DDTHH:MM:SS`.
- **`YYYY-MM-DDTHH:MM:SS`** — already in the final shape. Falls through the "anything else" branch unchanged.
- **`YYYY-MM-DD`** — date-only. Will become `YYYY-MM-DDT00:00:00`.

Notes:
- Use a `T` separator (not a space) between date and time.
- Hours must be 24-hour (`00`–`23`), two digits, zero-padded. Minutes and seconds two digits, zero-padded.
- Month `01`–`12`, day `01`–`31`, both two digits, zero-padded.
- **Do not include** a `Z`, `+HH:MM`, `-HH:MM`, or fractional seconds. Those all fall through the "unchanged" branch and will be forwarded verbatim to the target API — which may or may not accept them.
- The timestamp is treated as a local time. If the target API needs UTC, convert to UTC on your side before sending.

### Examples — `datetime`

| You send | Platform forwards |
|---|---|
| `2026-09-07T14:30` | `2026-09-07T14:30:00` |
| `2026-09-07T14:30:00` | `2026-09-07T14:30:00` (unchanged) |
| `2026-09-07` | `2026-09-07T00:00:00` |
| `2026-09-07T14:30:00Z` | `2026-09-07T14:30:00Z` (unchanged) |
| `2026-09-07T14:30:00.000` | `2026-09-07T14:30:00.000` (unchanged) |
| `09/07/2026 2:30 PM` | `09/07/2026 2:30 PM` (unchanged) |
| `""` (empty string) | mapping is skipped — field omitted from body |
| `null` / `undefined` | mapping is skipped — field omitted from body |

---

## 3. `date` — the rule the platform applies

Given the resolved value (converted to a string):

1. If the value **starts with** `YYYY-MM-DD`, only that leading `YYYY-MM-DD` substring is kept.
2. Otherwise, the value is forwarded unchanged.

### What your software should send

- **`YYYY-MM-DD`** — this is the canonical form. It passes through unchanged.
- You **may** send a full ISO timestamp (e.g. `2026-09-07T14:30:00`) — the platform will strip the time portion and send only `2026-09-07`.

### Examples — `date`

| You send | Platform forwards |
|---|---|
| `2026-09-07` | `2026-09-07` |
| `2026-09-07T14:30:00` | `2026-09-07` |
| `2026-09-07T14:30:00Z` | `2026-09-07` |
| `09/07/2026` | `09/07/2026` (unchanged — no leading `YYYY-MM-DD`) |
| `Sep 7, 2026` | `Sep 7, 2026` (unchanged) |

---

## 4. Other relevant data types (for context)

If a mapping is not `date` or `datetime`, it is coerced like this:

| `dataType` | Behavior |
|---|---|
| `string` (default) | `String(value)` |
| `integer` | `parseInt(String(value))` |
| `number` | `parseFloat(String(value))` |
| `boolean` | `String(value).toLowerCase() === 'true'` — only literal `"true"` becomes `true`; everything else becomes `false` |
| `zip_postal` | strips whitespace, uppercases; formats Canadian `A1A1A1` → `A1A 1A1`, US `12345-6789` → `12345`; else uppercased string |

Null and undefined values are dropped from the body — the field is not sent.

---

## 5. Recommended format for your software (TL;DR)

- Use `YYYY-MM-DDTHH:MM` for timestamps (24-hour, zero-padded, `T` separator, no timezone).
- Use `YYYY-MM-DD` for dates.
- Treat these as local, naive values — if you need UTC, convert on your side first.
- Never include a `Z` or `±HH:MM` offset unless the receiving API is known to require it, because the platform will pass those through verbatim rather than converting them.

---

## 6. Change history

- **2026-09-07** — initial spec, based on the logic in `json-workflow-processor-v2/steps/apiEndpoint.ts` and `.../steps/api.ts` (dataType-driven request-body coercion).
