# 2026-07-27 — Review Template / Extraction Type Relationship Flip

## Summary

Decoupled inbox review templates from extraction types. Previously, each review template was tied to exactly one extraction type. Now, review templates are standalone and reusable — multiple extraction types can share the same template.

## What Changed

### Database

- `inbox_review_templates.extraction_type_id` — made nullable (was NOT NULL). No longer the source of truth.
- `inbox_review_templates.is_default` — new boolean column. Marks the fallback template used when an extraction type has no specific template assigned.
- `extraction_types.inbox_review_template_id` — new nullable FK to `inbox_review_templates(id)` with ON DELETE SET NULL.

### Review Template Setup (Admin)

- Removed the "Linked Extraction Type" dropdown from the review template editor.
- Added a "Default Template" toggle — one template can be marked as the default.
- Templates are now purely identified by name and description.

### Extraction Type Setup (Admin)

- When "Enable Review Before Workflow" is checked, a new "Review Template" dropdown appears.
- Options: "Use Default Template" (default) or any active review template.
- This is where the link between extraction type and template now lives.

### Service Layer

- `loadTemplateByExtractionType` now checks the extraction type's `inbox_review_template_id` first, then falls back to the template marked `is_default`.
- Added `loadFullTemplate(templateId)` for direct template loading (used by preview).
- `createTemplate` / `updateTemplate` no longer accept or persist `extractionTypeId`.
- Import flow no longer requires selecting an extraction type.

### TypeScript Types

- `InboxReviewTemplate` — removed `extractionTypeId`, added `isDefault`.
- `ExtractionType` — added optional `inboxReviewTemplateId`.

## How It Works Now

1. Create one or more review templates in the Review Setup admin.
2. Mark one as "Default" — this is the fallback for any extraction type that doesn't specify a template.
3. In Extraction Type setup, optionally pick a specific review template from the dropdown.
4. At runtime, the system checks the extraction type's assigned template first, then falls back to the default.
