# Execute Flow — API Endpoint Step: Request Body & Field Mappings

**Date:** 2026-08-21
**Scope:** The Execute Flow → Workflow step of type **API Endpoint**, specifically:
- The **Map JSON** button next to the *Request Body* textarea
- The **Field Mappings** section (Type, Data Type, Add Field, Function, and the `{ }` variable picker)

This document is written so it can be dropped into another application/repository and used verbatim as a spec. It describes both the visible behaviour of the UI and the underlying data shapes that get persisted with the workflow step.

---

## 1. Where these controls live

The controls documented here appear inside the **API Endpoint** step configuration panel of an Execute Flow (workflow v2). They are only rendered when the HTTP method requires a body:

- `POST`
- `PUT`
- `PATCH`

For `GET` / `DELETE` / `HEAD`, the Request Body section is hidden completely.

Layout (top to bottom):

```
[ Request Body ]                                  [ Map JSON ]
+-------------------------------------------------------------+
|  { ...JSON template textarea... }                           |
+-------------------------------------------------------------+
(JSON parse error banner appears here when invalid)

[ Field Mappings ]                       [ Function ] [ + Add ]
+-------------------------------------------------------------+
|  <fieldName>   [Type v]   [DataType v]              [x]     |
|  <value / function picker / variable>       [ { } ]         |
+-------------------------------------------------------------+
   ... one card per mapping ...
```

---

## 2. Request Body textarea

A free-form JSON template. Two purposes:

1. It is the **shape** that will be POSTed / PUT / PATCH-ed to the API.
2. It is the **source** that the **Map JSON** button reads to auto-generate Field Mappings.

Validation:

- The textarea does not force valid JSON on every keystroke, but as soon as the user clicks **Map JSON**, the value is parsed with `JSON.parse`. Failures are surfaced in a red inline banner reading `JSON parse error: <message>` and the textarea border turns red.
- The parse error clears the moment the user edits the textarea again.
- An example placeholder is shown when empty:
  ```json
  {
    "field": "value",
    "id": 0
  }
  ```

Persisted as: `config.requestBodyTemplate: string`.

---

## 3. The **Map JSON** button

**Purpose.** One-click generator that walks the JSON in the Request Body textarea and produces one **Field Mapping** entry per leaf field so the user does not have to type them out by hand.

### 3.1 Algorithm

Pseudocode of the exact traversal:

```ts
function generateFieldMappings() {
  if (!requestBodyTemplate) return;               // nothing to do

  let template;
  try {
    template = JSON.parse(requestBodyTemplate);   // must be valid JSON
  } catch (err) {
    setJsonParseError(err.message);
    return;
  }

  const mappings: RequestBodyFieldMapping[] = [];

  function extractFields(obj: any, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      const fieldName = prefix ? `${prefix}.${key}` : key;

      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        // Recurse into the FIRST array element only, prefixed with [0]
        extractFields(value[0], `${fieldName}[0]`);
      } else if (value && typeof value === 'object') {
        // Recurse into nested object
        extractFields(value, fieldName);
      } else {
        // Leaf — infer data type from the sample value
        let dataType: 'string' | 'number' | 'integer' | 'boolean' = 'string';
        if (typeof value === 'number') {
          dataType = Number.isInteger(value) ? 'integer' : 'number';
        } else if (typeof value === 'boolean') {
          dataType = 'boolean';
        }
        mappings.push({
          fieldName,
          type:  'hardcoded',
          value: '',        // deliberately blank — user must fill it in
          dataType,
        });
      }
    }
  }

  extractFields(template);

  // Merge: skip any field name that already exists in the mappings list.
  const existing    = new Set(requestBodyFieldMappings.map(m => m.fieldName));
  const newMappings = mappings.filter(m => !existing.has(m.fieldName));

  updateConfig('requestBodyFieldMappings',
    [...requestBodyFieldMappings, ...newMappings]);
}
```

### 3.2 Key behaviours to reproduce

| Behaviour | Rule |
|-----------|------|
| Dot notation for nested objects | `customer.address.city` |
| Arrays of objects | Recurses into `array[0]`, so the path becomes `items[0].sku`. Only the first element is inspected. |
| Arrays of primitives (or empty arrays) | Emitted as a single leaf with `dataType: 'string'`. |
| Data type inference | `number` (float), `integer` (int), `boolean`, otherwise `string`. `null` is treated as string. Dates are not detected from the template — the user picks `date` / `datetime` manually. |
| Value column | Always generated **empty** (`value: ''`). The template value is used ONLY for shape and type inference — the user must supply the actual runtime source. |
| Type column | Always generated as `'hardcoded'`. |
| Idempotency | Re-clicking Map JSON does not duplicate rows. Any `fieldName` that already exists in `requestBodyFieldMappings` is skipped. New keys added to the JSON since the last click get appended. Existing rows are never modified. |
| Deletion | Removing a key from the JSON does **not** remove its mapping. The user must delete stale rows manually. |

### 3.3 Worked example

Given this Request Body:

```json
{
  "orderId": "ABC123",
  "isRush": false,
  "weight": 12.5,
  "count": 3,
  "shipper": {
    "name": "Acme",
    "phone": "555-1234"
  },
  "items": [
    { "sku": "X1", "qty": 2 }
  ]
}
```

Map JSON produces:

| fieldName            | type       | value | dataType |
|----------------------|------------|-------|----------|
| `orderId`            | hardcoded  | ""    | string   |
| `isRush`             | hardcoded  | ""    | boolean  |
| `weight`             | hardcoded  | ""    | number   |
| `count`              | hardcoded  | ""    | integer  |
| `shipper.name`       | hardcoded  | ""    | string   |
| `shipper.phone`      | hardcoded  | ""    | string   |
| `items[0].sku`       | hardcoded  | ""    | string   |
| `items[0].qty`       | hardcoded  | ""    | integer  |

---

## 4. Field Mappings

Each mapping row describes **one leaf field** that will be substituted into the request body at runtime. The persisted array lives at `config.requestBodyFieldMappings`.

### 4.1 Persisted shape

```ts
type RequestBodyFieldMapping = {
  fieldName: string;                        // dotted / bracketed path, e.g. items[0].sku
  type:     'hardcoded' | 'variable' | 'function';
  value:    string;                         // meaning depends on `type` (see below)
  dataType: 'string' | 'number' | 'integer'
          | 'date'   | 'datetime' | 'boolean';
  functionId?: string;                      // set iff type === 'function'
};
```

### 4.2 Row layout

```
Row 1 (header row of the card):
   [ fieldName input ] [ Type dropdown ] [ DataType dropdown ] [ trash icon ]

Row 2 (body of the card):
   type === 'hardcoded'  →  [ text input ]
   type === 'variable'   →  [ text input ]  [ { } button ]
   type === 'function'   →  [ Function dropdown ]
```

The card background is colour-coded by type so users can eyeball what a large mappings list is doing:

| Type       | Card background       |
|------------|-----------------------|
| hardcoded  | green   (`bg-green-50`) |
| variable   | blue    (`bg-blue-50`)  |
| function   | amber   (`bg-amber-50`) |

### 4.3 The **Type** dropdown

Three options — this decides how `value` is interpreted at runtime.

| Type         | Meaning                                                                                                   | Value column contains                         |
|--------------|-----------------------------------------------------------------------------------------------------------|-----------------------------------------------|
| **Hardcoded** | Literal constant, written verbatim into the outgoing JSON.                                                | A plain string / number / boolean literal.    |
| **Variable**  | A `{{path}}` reference that gets resolved from the workflow context at runtime (previous step outputs, extraction results, submission fields, execute variables, etc.). | A template string, e.g. `{{execute.orderId}}` or `{{step1.response.data.id}}`. Multiple `{{...}}` tokens may be concatenated with literal text. |
| **Function**  | A saved reusable expression from *Field Mapping Functions*. The named function is executed at runtime, its result is coerced by `dataType`, and that becomes the field value. | Not user-editable; the row shows a **function picker dropdown** instead of a text input. The chosen function's ID is stored in `functionId` and its human name in `value` for display. |

Switching between types cleans stale state:

- `hardcoded` → `variable`: value carries over untouched (user can just add `{{...}}` tokens).
- `→ function`: `value` is cleared to `''`, awaiting a function selection.
- `function → anything else`: `functionId` is set back to `undefined`.

### 4.4 The **Data Type** dropdown

Six options. This drives runtime coercion when the mapping is inserted into the outgoing JSON body — the raw string is parsed / normalized to the right JSON primitive.

| Data Type   | Coerced to           | Notes                                                                 |
|-------------|----------------------|-----------------------------------------------------------------------|
| **String**  | JSON string          | Default. Empty values remain empty strings.                           |
| **Number**  | JSON number (float)  | `"12.50"` → `12.5`. Non-numeric input → error at runtime.             |
| **Integer** | JSON number (int)    | Truncates/parses. `"3.7"` → `3`.                                      |
| **Date**    | ISO date string      | Formatted as `YYYY-MM-DD`. Blank source values are emitted as `null`. |
| **DateTime**| ISO datetime string  | Formatted as full ISO 8601. Blank source values are emitted as `null`.|
| **Boolean** | JSON `true` / `false`| Truthy strings (`"true"`, `"1"`, `"yes"`) → `true`, otherwise `false`.|

Data Type is chosen **per row** and is independent of what Map JSON originally inferred — the user is free to override it.

### 4.5 The **Add** button (`+ Add`)

Top-right of the Field Mappings header. Appends a fresh row with defaults:

```ts
{ fieldName: '', type: 'hardcoded', value: '', dataType: 'string' }
```

Use it to add fields that are NOT in the JSON template (e.g. runtime-only overrides), or when the template is empty and the user prefers to build the mappings by hand.

Note: rows added manually are still merged into the outgoing body under their `fieldName` path, so `customer.email` typed by hand produces the same nesting as if it had come from Map JSON.

### 4.6 The **Function** button

Top-right of the Field Mappings header, immediately left of **Add**. Opens the *Field Mapping Functions* modal for the current step, where the user can:

- Create a new named function scoped to the current workflow node.
- Edit or delete existing functions.
- Compose expressions using the same variable syntax available in Variable-type rows (`{{...}}`), plus helpers (concatenate, substring, arithmetic, conditional, date formatting, etc.).

Once the modal is closed, saved functions become selectable in any row whose Type is set to **Function**. The button only appears when a `currentNodeId` is known (i.e. the step has been saved at least once).

### 4.7 The `{ }` (Braces) button — Variable picker

Only rendered when a row's Type is set to **Variable**. Clicking it opens the **Variable Dropdown**, a searchable list of every value that is in scope at this point in the flow, typically grouped as:

- `execute.*` — fields from the Execute Setup form the user filled in.
- `extraction.*` — fields extracted from a PDF / email attachment.
- `submission.*` — Order Entry / submission-level values.
- `stepN.response.*` — outputs from previous workflow steps (API responses, transformations, etc.).
- `email.*` — sender, subject, body, headers when the flow was triggered by email.
- Custom variables surfaced by ancestor steps (loops, foreach, AI decisions, etc.).

Behaviour on selection:

- If the value input is empty, the picker inserts `{{selectedVariable}}`.
- If the value input already has text, the token is **appended**, allowing mixed templates such as `orders/{{execute.orderId}}/lines/{{step1.response.lineId}}`.
- The dropdown then closes automatically.

The variable input remains a free-text field, so users can also type or hand-edit `{{...}}` tokens directly without ever opening the picker.

---

## 5. Runtime resolution order (informative)

At execution time, each mapping is resolved in this order:

1. **Type dispatch**
   - `hardcoded` → use `value` verbatim.
   - `variable`  → replace every `{{path}}` token in `value` by looking `path` up in the current execution context.
   - `function`  → look up `functionId` in Field Mapping Functions, evaluate its expression against the same context, use the result.
2. **Data Type coercion** — the resolved value is converted per §4.4.
3. **Path assignment** — `fieldName` is split on `.` and `[n]`, and the coerced value is written into the request body object at that path, creating intermediate objects/arrays as needed.

Missing variables resolve to empty string by default; the resulting empty is then coerced by the Data Type (e.g. `null` for date/datetime, `false` for boolean, `0`/`NaN` for number — depending on how strict the step is configured, an error may be raised instead).

---

## 6. Trash icon

The red trash icon on each card removes that single mapping row. There is no undo. The Request Body textarea is not touched — the shape stays, only the resolution rule is gone. Clicking **Map JSON** afterwards will re-add a fresh row for that fieldName (because it is no longer in `requestBodyFieldMappings`).

---

## 7. Data model summary

Everything on this screen persists into the workflow node's `config` object:

```ts
config = {
  ...
  httpMethod: 'POST' | 'PUT' | 'PATCH' | 'GET' | 'DELETE' | 'HEAD',
  requestBodyTemplate: string,                       // raw JSON text
  requestBodyFieldMappings: RequestBodyFieldMapping[]
}
```

Nothing about Map JSON, the Variable dropdown, or the Function picker is stored separately — they are pure editors over these two fields.

---

## 8. Reproducing this screen in another app

Minimum work to port the feature:

1. Add a textarea bound to `requestBodyTemplate`.
2. Add a **Map JSON** button that runs the algorithm in §3.1 and merges into `requestBodyFieldMappings`.
3. Render the mappings list; each row exposes:
   - `fieldName` text input,
   - `type` dropdown (Hardcoded / Variable / Function),
   - `dataType` dropdown (String / Number / Integer / Date / DateTime / Boolean),
   - a value editor that switches shape based on `type`,
   - a Variable-picker (`{ }`) button that appends `{{path}}` tokens,
   - a Function dropdown fed by the app's saved Field Mapping Functions,
   - a delete button.
4. Provide an **Add** button that appends a blank mapping with defaults `{ type: 'hardcoded', value: '', dataType: 'string' }`.
5. Provide a **Function** button that opens the functions manager scoped to the current step.
6. At runtime, apply §5.

That is the entire contract.
