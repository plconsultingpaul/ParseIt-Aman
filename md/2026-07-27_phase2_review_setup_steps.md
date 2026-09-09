# Phase 2 — Review Setup Admin UI (Broken into Steps)

Phase 2 of the Inbox Step Implementation Plan adds a "Review Setup" tab to the Type Setup page with the full configuration interface. It is broken into 3 smaller steps to avoid large single changes.

---

## Step 1: Tab + Template Management Shell

**Goal:** Add the "Review Setup" tab to TypeSetupPage and create the ReviewSetupSettings component with template CRUD only.

### What to build:

1. **TypeSetupPage.tsx changes:**
   - Add `'review_setup'` to the `TypeSetupTab` union type
   - Add a new tab entry (icon: `LayoutGrid` from lucide-react, label: "Review Setup")
   - Gate behind `currentUser.permissions.extractionTypes` (same permission as extraction types since they are linked)
   - Render `<ReviewSetupSettings />` in the switch/case

2. **New file: `src/components/settings/ReviewSetupSettings.tsx`:**
   - Template selector dropdown (linked to extraction types)
   - "Create Template" button when no template exists for the selected extraction type
   - Template name/description editing
   - Delete template with confirmation
   - Active/inactive toggle
   - Loading and empty states

3. **Props:** Receives `extractionTypes: ExtractionType[]` from the parent

### Service used:
- `reviewSetupService.loadTemplates()`, `createTemplate()`, `updateTemplate()`, `deleteTemplate()`

---

## Step 2: Field Groups + Fields Management

**Goal:** Add the ability to manage field groups and fields within the ReviewSetupSettings component.

### What to build:

1. **Field Groups section (within ReviewSetupSettings):**
   - List of groups ordered by `groupOrder`
   - Add new group (name, optional description)
   - Edit group name, order, description
   - Toggle `isArrayGroup` + set `arrayJsonPath`
   - Toggle `isCollapsedByDefault`
   - Delete group (with confirmation)
   - Drag-to-reorder groups (or up/down arrows)

2. **Fields section (within each group):**
   - List of fields within the selected/expanded group
   - Add new field modal/form:
     - `fieldName`, `fieldLabel`, `jsonPath` (text inputs)
     - `fieldType` selector (text, number, date, dropdown, boolean, readonly)
     - `isRequired`, `isEditable`, `isVisible` toggles
     - `placeholder`, `helpText` (optional text inputs)
     - `dropdownOptions` (JSON array editor, shown only for dropdown type)
     - `validationRegex`, `maxLength` (optional)
   - Edit field (same form, pre-filled)
   - Delete field (with confirmation)
   - Reorder fields within a group

### Service used:
- `reviewSetupService.loadFieldGroups()`, `createFieldGroup()`, `updateFieldGroup()`, `deleteFieldGroup()`
- `reviewSetupService.loadFields()`, `createField()`, `updateField()`, `deleteField()`

---

## Step 3: Layout Designer Integration

**Goal:** Wire up the existing LayoutDesigner component to allow drag-and-drop field positioning on the 12-column grid.

### What to build:

1. **Layout tab/section toggle** within ReviewSetupSettings:
   - "Fields" view (from Step 2) vs "Layout" view toggle
   - When in Layout view, render the LayoutDesigner

2. **Adapter layer** — The LayoutDesigner expects `OrderEntryField[]`, `OrderEntryFieldGroup[]`, and `OrderEntryFieldLayout[]`. Create adapter functions that convert:
   - `InboxReviewField` → shape compatible with `OrderEntryField` (map `groupId` → `fieldGroupId`, supply defaults for unused fields)
   - `InboxReviewFieldGroup` → shape compatible with `OrderEntryFieldGroup` (supply defaults for `backgroundColor`, `borderColor`, `isCollapsible`, etc.)
   - `InboxReviewFieldLayout` ↔ `OrderEntryFieldLayout` (same shape, direct pass-through)

3. **Auto-save with debounce** (800ms, same pattern as Order Entry):
   - On `onLayoutChange` callback from LayoutDesigner, debounce and call `reviewSetupService.saveLayouts()`
   - Show saving/saved indicator

4. **Layout loading:**
   - On template selection, load layouts via `reviewSetupService.loadLayouts(fieldIds)`
   - Pass to LayoutDesigner

### Service used:
- `reviewSetupService.loadLayouts()`, `saveLayouts()`

---

## Execution Order

Run these steps sequentially:
1. Step 1 first — establishes the tab and basic template flow
2. Step 2 second — adds full group/field config without layout
3. Step 3 third — adds visual layout designer on top

Each step should result in a working, buildable app.
