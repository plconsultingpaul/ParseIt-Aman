# Execute Flow — API Endpoint Step: Function Button & Create Function Window

**Date:** 2026-08-21
**Scope:** In the Execute Flow → Workflow step of type **API Endpoint**, inside the *Field Mappings* section, the small amber **Function** button and the modal it opens (titled **Create Function** for new records and **Edit Function** for existing ones).

This document is written so it can be dropped into another application/repository and used to re-create the button, the modal, every field, every option, the validation rules, the Test panel, and the underlying persistence table verbatim.

---

## 1. Where the button lives

Inside the API Endpoint step configuration panel, in the header row of the **Field Mappings** section:

```
[ Field Mappings ]                       [ Function ] [ + Add ]
```

Layout notes:

- Header text: `Field Mappings` (left).
- Buttons (right, tight `space-x-1` group):
  - **Function** — amber background (`bg-amber-600`, hover `bg-amber-700`), `text-white`, tiny `text-[10px]` label, `px-2 py-0.5` padding, `<Code>` icon (`w-3 h-3 mr-0.5` from lucide-react).
  - **Add** — blue background (`bg-blue-600`, hover `bg-blue-700`), same size/shape, `<Plus>` icon.
- The **Function** button is only rendered when a persisted node id exists (`currentNodeId` is set). On a freshly created step that has not been saved yet, hide it — the modal needs an owner id to write against.

Clicking **Function** sets `showFunctionsModal = true` and portals the manager UI into the DOM (React `createPortal` into `document.body`, `z-index` above the config panel).

---

## 2. Two-layer UI

The Function button opens a **manager** view (list) rather than jumping straight into the editor. The editor is a nested modal reached from the manager.

```
Function button
  └─ Field Mapping Functions Manager (list of saved functions)
        ├─ New Function          → opens Function Editor Modal
        ├─ Copy from Another Type → opens Copy Selection modal → Copy Rename modal
        └─ Existing function card:
              ├─ Copy icon   → opens Copy Rename modal
              ├─ Edit icon   → opens Function Editor Modal (populated)
              └─ Trash icon  → confirm() then delete
```

This document focuses on the **Manager** and the **Function Editor Modal** ("Create Function" window). Copy modals reuse the same editor state and are secondary.

---

## 3. Field Mapping Functions Manager

Rendered inside the outer portal wrapper.

### 3.1 Header row

- Left: title `Field Mapping Functions` (`text-lg font-semibold`) and subtitle `Create reusable functions with conditional logic for field mappings` (`text-sm text-gray-600`).
- Right, two buttons:
  - **Copy from Another Type** — gray, `<Copy>` icon. Opens the Copy Selection modal to import a function saved on a *different* extraction type / workflow node / flow node.
  - **New Function** — blue, `<Plus>` icon. Opens the empty Function Editor.

### 3.2 Empty state

When no functions exist for this owner:

- Centered card, `border-2 border-dashed`.
- `<Code>` icon, `w-12 h-12`.
- Text: `No functions defined yet`.
- Primary button: `Create Your First Function` (blue, `<Plus>` icon) — opens the empty Function Editor.

### 3.3 Function card

One card per saved function, `grid gap-4`:

- Header row inside card:
  - `<Code>` icon (blue) + function name (`font-medium`).
  - Description (if present) — `text-sm text-gray-600`.
- Badges row:
  - If `function_type === 'date'`: purple pill `Date Function`.
  - Otherwise: blue pill `{N} condition{s}` where N is `function_logic.conditions.length`.
  - If `function_logic.default` is truthy: gray pill `Has default value`.
- Right side, three icon buttons (`p-2 rounded-lg`):
  - **Copy** (gray) — clones this function into another owner.
  - **Edit** (blue) — opens the Function Editor pre-filled.
  - **Delete** (red) — `confirm('Are you sure you want to delete this function?')` then removes it.

### 3.4 Loading and error states

- While the initial fetch runs, replace the list area with `Loading functions...` centered text.
- On any error, render a red banner (`bg-red-50 border border-red-200 rounded-lg`) above the list with the message.

---

## 4. The Create Function window (Function Editor Modal)

Reused component. Title switches based on mode:
- Create: `Create Function`
- Edit:   `Edit Function`

Rendered inside a standard Modal shell (backdrop + centered card + close button + `z-index: 80`).

### 4.1 Overall vertical layout

```
1. Function Name *        (single-line text input)
2. Description            (2-row textarea, optional)
3. Function Type          (2×2 grid of 4 big buttons)
4. Type-specific builder  (one of four panels)
5. Test Function          (test input + Play button + result box)
6. Error banner           (red, only when applicable)
7. Footer                 (Cancel | Save Function)
```

Wrapper `<div className="space-y-6">`.

### 4.2 Function Name (required)

- Label: `Function Name *`.
- `<input type="text">`, full width, `px-3 py-2 border rounded-lg`, focus ring blue.
- Placeholder: `e.g., province_to_code`.
- Validation on save: `functionName.trim()` must be non-empty; otherwise set inline error `Function name is required`.

### 4.3 Description

- Label: `Description`.
- `<textarea rows={2}>`, same styling as Name.
- Placeholder: `Optional description of what this function does`.
- Stored as `null` / omitted when empty.

### 4.4 Function Type picker

- Label: `Function Type`.
- Grid: `grid grid-cols-2 md:grid-cols-4 gap-3`.
- Four large buttons, each `flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2`.
- Selected style: blue border + light blue background + blue text (`border-blue-500 bg-blue-50 text-blue-700`, dark-mode equivalents).
- Unselected: gray border + gray text + hover gray-50 background.

The four types:

| Type            | Icon (lucide) | Title                    | Subtitle                                  |
|-----------------|---------------|--------------------------|-------------------------------------------|
| `conditional`   | `GitBranch`   | Conditional (IF/THEN)    | Map values based on conditions            |
| `date`          | `Calendar`    | Date Calculation         | Add/subtract days from dates              |
| `address_lookup`| `MapPin`      | Address Lookup           | AI-powered address field lookup           |
| `datetime_merge`| `Combine`     | Merge Date + Time        | Combine a Date and Time into one DateTime |

Switching type resets the builder state for the other types back to their `DEFAULT_*` constants (see §7.4) — the modal keeps only the state for the currently selected type as authoritative when saving.

---

## 5. Type-specific builders

### 5.1 Conditional (IF/THEN)

Uses a **Condition Builder** followed by a **Default Value** input.

#### 5.1.1 Condition Builder header

- Section label: `Conditions`.
- Two buttons on the right:
  - `Add Condition` — blue, `<Plus>` icon. **Prepends** a new condition (new one appears at the top of the list). New condition defaults:
    - `if.field`: first entry of `availableFields` or `''`.
    - `if.operator`: `equals`.
    - `if.value`: `''`.
    - `then`: `''`.
  - `Save` — green, `<Save>` icon. Same effect as the footer Save button. Only visible if the parent passed an `onSave` callback (the modal does).

#### 5.1.2 Empty state

Centered dashed card: `No conditions defined. Add a condition to get started.`

#### 5.1.3 Condition card

- Draggable via `@dnd-kit/sortable` — grip handle on the left (`<GripVertical>`).
- Ordinal badge `#N` in the top-left corner (`bg-gray-200 px-1.5 py-0.5 rounded`).
- Delete button (`<Trash2>`, red) removes the card.
- Body contains one **primary clause** and optional **AND clauses**, then a single **Then Return** value input.

#### 5.1.4 Clause fields (IF and AND)

Rendered in a responsive grid whose column count depends on whether the operator needs a value:

- Field: label `If Field` (primary) or `AND Field` (additional).
  - `CustomDropdown`, options are the `availableFields` list (dot-notation strings).
- Operator: label `Operator`.
  - `CustomDropdown` with **all eleven** operators, in this order:

    | value | label |
    |-------|-------|
    | `equals` | Equals |
    | `not_equals` | Not Equals |
    | `in` | In (List) |
    | `not_in` | Not In (List) |
    | `greater_than` | Greater Than |
    | `less_than` | Less Than |
    | `contains` | Contains |
    | `starts_with` | Starts With |
    | `ends_with` | Ends With |
    | `is_empty` | Is Empty |
    | `is_not_empty` | Is Not Empty |

- Value: only rendered when operator is **not** `is_empty` / `is_not_empty`.
  - For `in` / `not_in`: label `Values (comma-separated)`, placeholder `value1, value2, value3`. Value is split on `,` and trimmed into a string array. On display, arrays are re-joined with `, `.
  - Otherwise: label `Value`, placeholder `Enter value`, stored as string.

- Additional (AND) clauses live in `condition.additionalConditions: FunctionConditionClause[]`. They are visually separated with an `AND` divider (small blue uppercase label + hairline rule), indented with `pl-4 border-l-2 border-blue-300`, and each carries its own `<X>` remove button.

- Add-another button below the clauses: `Add AND Condition` (blue text-only pill, `<Plus>` icon).

#### 5.1.5 Then Return

- Below all clauses, separated by `border-t`.
- Label: `Then Return`.
- `<input type="text">`, placeholder `Return value`.
- Stored as `condition.then: string`.

#### 5.1.6 Default Value (outside the Condition Builder)

- Label: `Default Value`.
- Single-line input.
- Placeholder: `Value to return if no conditions match`.
- Persisted as `function_logic.default`. When the string is empty on save, it is written as `null`.

### 5.2 Date Calculation

A single grouped panel (`bg-gray-50 rounded-lg p-4 space-y-4`) with these controls:

- **Date Source** — `CustomDropdown`:
  - `current_date` — label `Current Date`.
  - `field` — label `Field from Data`.
- **Source Field** (only when Source = `field`):
  - `CustomDropdown` restricted to `availableFields` whose `dataType === 'datetime'`.
  - Placeholder `Select a date field...`.
  - If no datetime fields exist, show an amber help line: `No fields with datetime data type found. Set a field's data type to "datetime" in the field mappings.`
  - Otherwise show gray help line: `Only fields with datetime data type are shown`.
- **Operation** — pair of side-by-side pill buttons in a `grid-cols-2`:
  - `Add` (`<Plus>` icon), selected style green (`bg-green-100 border-green-500 text-green-700`).
  - `Subtract` (`<Minus>` icon), selected style red.
- **Days** — `<input type="number" min="0">`. Coerced to `Math.max(0, parseInt(value) || 0)`.
- **Output Format** — `CustomDropdown` with exactly these options:

  | value | label |
  |-------|-------|
  | `YYYY-MM-DD` | YYYY-MM-DD (2025-12-18) |
  | `MM/DD/YYYY` | MM/DD/YYYY (12/18/2025) |
  | `DD/MM/YYYY` | DD/MM/YYYY (18/12/2025) |
  | `YYYY-MM-DDTHH:mm:ss` | ISO DateTime (2025-12-18T00:00:00) |
  | `MM-DD-YYYY` | MM-DD-YYYY (12-18-2025) |

- **Result preview** — blue info card summarising the formula:
  `Current Date + 3 days (format: YYYY-MM-DD)` or `{fieldName} - 1 day (format: MM/DD/YYYY)` etc. Rebuilds live as the user changes inputs.

Save-time validation: when `source === 'field'`, `dateLogic.fieldName` must be non-empty, else error `Please select a source field for the date calculation`.

### 5.3 Address Lookup

Space-y-4 panel with four controls:

- **Input Fields (Address Components)** — help text: `Select the fields that contain the address information to use for lookup`.
  - A `CustomDropdown` with placeholder `Add a field...`. Options are `availableFields` **minus** anything already picked.
  - Selecting a value appends it to `addressLookupLogic.inputFields` and clears the dropdown.
  - Below the dropdown, chosen fields render as blue pills (`bg-blue-100 rounded-full`) with an `<X>` remove button each.
- **Lookup Type (What to Return)** — `CustomDropdown`:

  | value | label |
  |-------|-------|
  | `postal_code` | Postal Code / ZIP Code |
  | `city` | City |
  | `province` | Province / State |
  | `country` | Country |
  | `full_address` | Full Formatted Address |

- **Country Context (Optional)** — `CustomDropdown`:

  | value | label |
  |-------|-------|
  | `` (empty) | Auto-detect |
  | `Canada` | Canada |
  | `United States` | United States |
  | `Mexico` | Mexico |

  Help text: `Helps AI provide more accurate results for the specified country`.

- **Default Value (Fallback)** — text input. Help text: `If the AI cannot determine a value, this fallback will be used instead`.

Save-time validation: `inputFields.length >= 1`, else error `Please select at least one input field for the address lookup`.

### 5.4 Merge Date + Time

Space-y-4 panel:

- **Date Field \*** — `CustomDropdown` filtered to fields with `dataType ∈ {undefined, 'date', 'datetime', 'string'}`. Options display as `fieldName (dataType)` when the type is known. Help: `Select the WFO field that contains the date portion.`
- **Time Field \*** — same, but filtered to `{undefined, 'time', 'datetime', 'string'}`. Help: `Select the WFO field that contains the time portion.`
- **Input Date Format (Optional)** — `CustomDropdown`:

  | value | label |
  |-------|-------|
  | `` | Auto-detect |
  | `MM/DD/YYYY` | MM/DD/YYYY (US) |
  | `DD/MM/YYYY` | DD/MM/YYYY (EU) |
  | `YYYY-MM-DD` | YYYY-MM-DD (ISO) |
  | `DD-MMM-YYYY` | DD-MMM-YYYY |

  Help: `Only needed to disambiguate numeric dates like 03/04/2026.`
- **Default Time When Empty (Optional)** — text input, placeholder `e.g., 23:59:59`. Help copy:
  > Used when the time field is blank or unparseable. Use 00:00:00 for "start of day" fields and 23:59:59 for "end of day" fields. Leave blank to default to 00:00:00.
- **Output Format \*** — `CustomDropdown`:

  | value | label |
  |-------|-------|
  | `YYYY-MM-DDTHH:mm:ss` | YYYY-MM-DDTHH:mm:ss (ISO, no TZ) |
  | `YYYY-MM-DDTHH:mm:ssZ` | YYYY-MM-DDTHH:mm:ssZ (ISO, UTC) |
  | `YYYY-MM-DD HH:mm:ss` | YYYY-MM-DD HH:mm:ss |
  | `MM/DD/YYYY HH:mm:ss` | MM/DD/YYYY HH:mm:ss |
  | `MM/DD/YYYY HH:mm` | MM/DD/YYYY HH:mm |
  | `DD/MM/YYYY HH:mm:ss` | DD/MM/YYYY HH:mm:ss |
  | `DD/MM/YYYY HH:mm` | DD/MM/YYYY HH:mm |

Save-time validation: both `dateFieldName` and `timeFieldName` must be non-empty, with individual error messages `Please select a Date field` / `Please select a Time field`.

---

## 6. Test Function panel

Rendered below the type-specific builder, separated by `border-t pt-4`.

- Section heading: `Test Function` (`text-sm font-medium`).
- If `functionType === 'date'` AND `dateLogic.source === 'current_date'`:
  - Show hint text: `Click "Test Function" to see the calculated date using the current date.`
- Otherwise:
  - Show a single `Test Value` text input. Placeholder differs by type:
    - Date: `Enter a date value (e.g., 2025-12-18)`.
    - Others: `Enter a test value (e.g., SITE2, BC, 123)`.
- Collapsible `<details>` labelled `Advanced: Test with JSON Data`:
  - Contains a textarea labelled `Test Data (auto-generated from conditions)`.
  - Placeholder `Add conditions above to generate test data`.
  - When Conditional conditions change, the modal auto-builds a JSON object by walking each condition's `if.field` path and assigning the first value; user can still hand-edit.
- **Test Function** button — gray (`bg-gray-600`), `<Play>` icon.
- Result box — green (`bg-green-50 border border-green-200 rounded-lg`), shown only after a successful test. Two rows:
  - `Input:` — either the raw test value string or `JSON.stringify(parsedTestData, null, 2)` inside a white/dark `font-mono` code block.
  - `Output:` — same formatting, the value the evaluator produced.

Test behaviour per type:

- **Conditional**: builds a data object from `testValue` (single-field, using `conditions[0].if.field` path) or falls back to `JSON.parse(testData)`. If neither is provided, error `Please enter a test value or test data`. Passes `{ conditions, default: defaultValue }` to the evaluator.
- **Date**: if source is `current_date`, calls evaluator with `{}`. If source is `field`, injects `testValue` at the configured `fieldName` path or under a default `date` key.
- **DateTime Merge**: requires JSON test data containing both configured field names. If empty, error `Please enter JSON test data containing "<dateFieldName>" and "<timeFieldName>"`.
- **Address Lookup**: requires JSON test data. Requires at least one input field configured (else error `Please select at least one input field`). Calls `testAddressLookup` (async, hits the AI service).

Any thrown error becomes the inline red banner text: `err instanceof Error ? err.message : 'Invalid test data'`.

---

## 7. Persistence

### 7.1 Table

Table name: **`field_mapping_functions`**. Supabase-managed (Postgres).

Recommended shape (mirror this exactly):

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | `gen_random_uuid()` default |
| `extraction_type_id` | `uuid` FK, nullable | Owner when opened from an Extraction Type |
| `workflow_v2_node_id` | `uuid` FK, nullable | Owner when opened from a Workflow v2 node — **this is the case for the API Endpoint step** |
| `flow_node_id` | `uuid` FK, nullable | Owner when opened from an Execute Button flow node |
| `function_name` | `text` NOT NULL | Human name; must be unique per owner (enforced client-side by the copy flow) |
| `description` | `text` | Optional |
| `function_type` | `text` NOT NULL | One of `conditional`, `date`, `address_lookup`, `datetime_merge` |
| `function_logic` | `jsonb` NOT NULL | Shape depends on `function_type` — see §7.2 |
| `created_at` | `timestamptz` DEFAULT `now()` | |
| `updated_at` | `timestamptz` DEFAULT `now()` | Bump on update |

Enable RLS on the table and write four policies (SELECT, INSERT, UPDATE, DELETE) scoping rows by whichever owner column applies for your app's auth model.

Exactly one of `extraction_type_id`, `workflow_v2_node_id`, `flow_node_id` should be set on any given row — enforce with a `CHECK` if desired.

### 7.2 `function_logic` shape by type

**Conditional**:
```ts
{
  conditions: [
    {
      if: {
        field: string,
        operator: FunctionOperator,   // one of the 11 in §5.1.4
        value: string | string[],     // string[] iff operator is 'in' / 'not_in'
      },
      additionalConditions?: Array<{  // implicit AND
        field: string,
        operator: FunctionOperator,
        value: string | string[],
      }>,
      then: string,                   // return value if condition matches
    },
    ...
  ],
  default: string | null,
}
```

**Date**:
```ts
{
  type: 'date',
  source: 'current_date' | 'field',
  fieldName?: string,                  // required when source === 'field'
  operation: 'add' | 'subtract',
  days: number,                        // >= 0
  outputFormat: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DDTHH:mm:ss' | 'MM-DD-YYYY',
}
```

**Address Lookup**:
```ts
{
  type: 'address_lookup',
  inputFields: string[],                                       // 1..N
  lookupType: 'postal_code' | 'city' | 'province' | 'country' | 'full_address',
  countryContext?: 'Canada' | 'United States' | 'Mexico',      // omit for auto-detect
  defaultValue?: string,                                       // fallback
}
```

**DateTime Merge**:
```ts
{
  type: 'datetime_merge',
  dateFieldName: string,
  timeFieldName: string,
  inputDateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD-MMM-YYYY',
  emptyTimeDefault?: string,       // e.g. '23:59:59'
  outputFormat: 'YYYY-MM-DDTHH:mm:ss'
              | 'YYYY-MM-DDTHH:mm:ssZ'
              | 'YYYY-MM-DD HH:mm:ss'
              | 'MM/DD/YYYY HH:mm:ss'
              | 'MM/DD/YYYY HH:mm'
              | 'DD/MM/YYYY HH:mm:ss'
              | 'DD/MM/YYYY HH:mm',
}
```

### 7.3 CRUD (Supabase)

- **List** — `select * from field_mapping_functions where <owner_col> = <id> order by function_name`.
- **Fetch by id** — `select ... where id = ? .single()`.
- **Create** — `insert(...).select().single()` on a single row; include exactly one of the three owner columns.
- **Update** — `update(...).eq('id', id).select().single()`. Never send `id`, `created_at`, or `updated_at` in the body.
- **Delete** — `delete().eq('id', id)`. Client asks for confirmation first.
- **Copy** — read the source row, then insert a new row with a new `function_name` and the desired owner column set. Same `function_type` and `function_logic` are copied verbatim.

### 7.4 Client defaults when opening the modal empty

```ts
DEFAULT_DATE_LOGIC = {
  type: 'date',
  source: 'current_date',
  operation: 'add',
  days: 0,
  outputFormat: 'YYYY-MM-DD',
};

DEFAULT_ADDRESS_LOOKUP_LOGIC = {
  type: 'address_lookup',
  inputFields: [],
  lookupType: 'postal_code',
  countryContext: 'Canada',
};

DEFAULT_DATETIME_MERGE_LOGIC = {
  type: 'datetime_merge',
  dateFieldName: '',
  timeFieldName: '',
  outputFormat: 'YYYY-MM-DDTHH:mm:ss',
};

// Conditional starts with an empty conditions array and no default.
```

---

## 8. Save / Cancel

Footer strip (`border-t pt-4`, right-aligned buttons):

- **Cancel** — ghost gray button; disabled while `isSaving`; simply calls `onClose()`.
- **Save Function** — blue primary; label switches to `Saving...` while a request is in flight; disabled during the save.

Save order:

1. Client validation (see §4.2, §5.2, §5.3, §5.4).
2. Compose the correct `function_logic` object from the currently selected `functionType`.
3. `updateFunction(id, ...)` when editing, otherwise `createFunction(...)` with the correct owner column set on the payload.
4. On success, invoke the parent's `onSave` callback (which re-fetches the manager list) and close the modal.
5. On thrown error, keep the modal open and put the message in the red inline banner.

---

## 9. Wiring the button in the API Endpoint step

Minimum props the modal needs to persist correctly from inside the API Endpoint step:

- `isOpen` boolean.
- `onClose` handler.
- `functionData` — `null` when creating, or the previously loaded row when editing.
- `workflowNodeId` — the current step's persisted node id. **Do not open the modal unless this exists.**
- `availableFields` — the current list of Field Mappings from the step, mapped to `{ fieldName, dataType }`. This is what powers every `CustomDropdown` inside the modal (Field / Source Field / Date & Time fields / Address input fields).
- `extractionTypes` — needed by the "Copy from Another Type" flow. In an API Endpoint step, this is the list of available copy sources; pass an empty array if not applicable.
- `onSave` — re-fetches the manager list.

After saving, refresh the list of functions available to Field Mapping rows whose Type is set to `Function`, so the newly saved function is immediately pickable in the row's function dropdown.

---

## 10. Reproduction checklist

For an implementer in another app:

1. Create the `field_mapping_functions` Supabase table with the schema in §7.1 and enable RLS with SELECT/INSERT/UPDATE/DELETE policies scoped by owner.
2. Add a service module with the six CRUD helpers plus two `copyFunctionTo*` variants.
3. Build the Manager component (§3) rendered inside the API Endpoint step config.
4. Build the Function Editor Modal (§4–§6) with the Type picker, four builders, and the Test panel.
5. Wire the amber **Function** button in the Field Mappings header to open the Manager and pass in `workflowNodeId`, `availableFields`, and `onSave`.
6. On every save, re-query functions for the current step so the Function-type mapping row's dropdown reflects reality.

That is the entire contract.
