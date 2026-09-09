# Driver Mobile App -- Full Build Plan

## Overview

A mobile application for drivers that integrates with Parse-It and an external TMS (Transportation Management System). Trips are ingested from the TMS via a scheduled API poller, routed to the correct Execute Flows based on stop type rules, and presented to drivers on their phones. Drivers complete workflows at each stop (forms, photos, signatures, barcodes), with full offline support. Dispatchers see real-time driver locations on a live map and manage trips from the Parse-It web interface.

All infrastructure runs inside each customer's own Parse-It environment (Supabase project). There is no shared middleware or central server beyond the Parse-It instance itself.

---

## Key Concepts

### Trip Structure

A **trip** is a parent record representing a driver's assignment. Inside each trip is an ordered list of **stops**. Each stop has a **stop type** (e.g., "pickup", "delivery", "depart terminal", "scale", "border crossing") and each stop type maps to a specific **Execute Flow** that the driver completes at that stop.

### Two Trip Types

1. **LTL (Less Than Load)** -- Driver starts at a terminal, makes multiple pickups and/or deliveries along a route, and returns to the terminal. Example stop sequence:
   - Stop 1: Depart Terminal (Depart Terminal Flow)
   - Stop 2: Customer A - Pickup (Pickup Flow)
   - Stop 3: Customer B - Delivery (Delivery Flow)
   - Stop 4: Customer C - Pickup (Pickup Flow)
   - Stop 5: Customer D - Delivery (Delivery Flow)
   - Stop 6: Arrive Terminal (Arrive Terminal Flow)

2. **Truckload** -- Driver picks up from one or more shippers and delivers to one or more receivers. May include non-customer stops like scales or border crossings. Example stop sequence:
   - Stop 1: Shipper Warehouse - Pickup (Pickup Flow)
   - Stop 2: Scale (Scale Stop Flow)
   - Stop 3: Border Crossing (Border Crossing Flow)
   - Stop 4: Receiver Warehouse - Delivery (Delivery Flow)

### Offline Model

- The driver app pre-downloads trip data and all assigned flow definitions when the trip first arrives (while the driver has connectivity).
- When offline, the app renders forms locally and evaluates simple conditions (e.g., "damage? yes → show photo capture") on-device.
- Completed stop data goes into a local **outbox** and syncs when connectivity returns.
- Server-side steps (API calls to TMS, emails, etc.) execute on sync, not on the device.
- Design rule for operators: all branching a driver encounters should be based on driver input, not external API lookups. API steps go at the end of the flow for server-side processing after sync.

### Driver-to-Customer Relationship

Each driver works for one Parse-It customer. The driver app connects to that customer's Parse-It environment via QR code scan (reusing the existing mobile connection pattern from the Applications settings page). The driver authenticates with their own credentials against that customer's Supabase auth.

---

## Database Tables Reference

All tables listed below will be created through Supabase migrations with RLS enabled. Each table includes the standard `id` (uuid), `created_at`, and `updated_at` fields unless noted otherwise.

### `trip_ingestion_configs`
Holds the TMS API connection configuration for each customer. One row per customer environment.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid, PK | |
| `name` | text | Friendly name for this config (e.g., "TruckMate Polling") |
| `api_spec_id` | uuid, FK → api_specs | Which API spec defines the TMS endpoints |
| `polling_endpoint` | text | The specific API path to call for new/updated trips |
| `polling_interval_minutes` | integer | How often to poll (e.g., 5, 10, 15) |
| `auth_config` | jsonb | Authentication details (method, credentials, token URL) -- encrypted or stored in secrets |
| `driver_id_field` | text | Which field in the TMS response maps to the driver identifier |
| `driver_match_field` | text | Which field on the Parse-It user record to match against (e.g., employee_number) |
| `trip_reference_field` | text | Which field in the TMS response is the unique trip ID |
| `response_mapping` | jsonb | Maps TMS response fields to trip/stop record fields |
| `is_active` | boolean | Whether polling is enabled |
| `last_polled_at` | timestamptz | When the poller last ran |
| `last_poll_status` | text | "success" or "error" with message |
| `company_id` | uuid, FK → companies | Which company this config belongs to |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `stop_type_workflow_rules`
Maps TMS stop type flags to Execute Flows. Multiple rows per customer -- one for each stop type they use.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid, PK | |
| `ingestion_config_id` | uuid, FK → trip_ingestion_configs | Which ingestion config this rule belongs to |
| `stop_type_code` | text | The code from the TMS (e.g., "PU", "DEL", "DEP", "ARR", "SCL", "BDR") |
| `stop_type_label` | text | Human-readable label (e.g., "Pickup", "Delivery", "Depart Terminal") |
| `execute_button_id` | uuid, FK → execute_buttons | Which Execute Flow to assign to this stop type |
| `trip_type` | text | Optional: restrict this rule to a specific trip type (e.g., "LTL", "TL") or null for all |
| `sort_order` | integer | Display order in the settings UI |
| `is_active` | boolean | Whether this rule is active |
| `company_id` | uuid, FK → companies | |
| `created_at` | timestamptz | |

### `driver_trips`
The parent trip record received from the TMS.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid, PK | |
| `company_id` | uuid, FK → companies | |
| `ingestion_config_id` | uuid, FK → trip_ingestion_configs | Which config ingested this trip |
| `tms_trip_id` | text | The trip ID from the TMS (for deduplication and callbacks) |
| `trip_type` | text | "LTL", "TL", or other customer-defined types |
| `driver_user_id` | uuid, FK → users | The assigned Parse-It driver user |
| `status` | text | "pending", "in_progress", "completed", "cancelled" |
| `scheduled_date` | date | The scheduled date for this trip |
| `origin_name` | text | First stop location name (for display) |
| `origin_address` | text | First stop address |
| `destination_name` | text | Last stop location name (for display) |
| `destination_address` | text | Last stop address |
| `trip_summary` | jsonb | Summary data for display (total stops, total pieces, weight, etc.) |
| `tms_raw_data` | jsonb | The full raw TMS API response for this trip |
| `started_at` | timestamptz | When the driver started the first stop |
| `completed_at` | timestamptz | When the driver completed the last stop |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `trip_stops`
Ordered stops within a trip. Each stop has its own assigned Execute Flow.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid, PK | |
| `trip_id` | uuid, FK → driver_trips | Parent trip |
| `sequence_number` | integer | Order of this stop in the trip (1, 2, 3...) |
| `stop_type_code` | text | The stop type code from the TMS (matches stop_type_workflow_rules) |
| `stop_type_label` | text | Human-readable label |
| `execute_button_id` | uuid, FK → execute_buttons | The assigned Execute Flow |
| `location_name` | text | Customer/location name |
| `location_address` | text | Full address |
| `location_lat` | double precision | Latitude (for map display and distance calculations) |
| `location_lng` | double precision | Longitude |
| `scheduled_time` | timestamptz | When the driver is expected at this stop |
| `special_instructions` | text | Notes for the driver |
| `tms_stop_id` | text | The stop ID from the TMS (for callbacks) |
| `status` | text | "pending", "in_progress", "completed", "skipped", "failed" |
| `started_at` | timestamptz | When the driver started this stop's flow |
| `completed_at` | timestamptz | When the driver completed this stop's flow |
| `flow_result_data` | jsonb | The data the driver submitted through the Execute Flow |
| `tms_callback_status` | text | "pending", "sent", "failed" -- whether the TMS has been updated |
| `tms_callback_error` | text | Error message if the TMS callback failed |
| `tms_raw_data` | jsonb | Raw TMS data for this specific stop |
| `company_id` | uuid, FK → companies | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `driver_locations`
Current location of each active driver. One row per driver, upserted on each location update.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid, PK | |
| `driver_user_id` | uuid, FK → users, UNIQUE | One row per driver |
| `company_id` | uuid, FK → companies | |
| `current_trip_id` | uuid, FK → driver_trips, nullable | The trip the driver is currently working |
| `current_stop_id` | uuid, FK → trip_stops, nullable | The stop the driver is currently at or heading to |
| `latitude` | double precision | |
| `longitude` | double precision | |
| `heading` | double precision | Compass heading in degrees (0-360) |
| `speed` | double precision | Speed in km/h or mph |
| `accuracy` | double precision | GPS accuracy in meters |
| `is_online` | boolean | Whether the driver app is actively reporting (set to false by a cleanup job if no update in X minutes) |
| `last_reported_at` | timestamptz | Timestamp of the most recent location reading from the device |
| `updated_at` | timestamptz | |

### `driver_location_history`
Append-only log of driver positions for route replay and auditing.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid, PK | |
| `driver_user_id` | uuid, FK → users | |
| `company_id` | uuid, FK → companies | |
| `trip_id` | uuid, FK → driver_trips, nullable | |
| `stop_id` | uuid, FK → trip_stops, nullable | |
| `latitude` | double precision | |
| `longitude` | double precision | |
| `heading` | double precision | |
| `speed` | double precision | |
| `recorded_at` | timestamptz | When the reading was taken on the device |
| `created_at` | timestamptz | When it was received by the server |

### `driver_push_tokens`
Stores device push notification tokens for sending trip alerts.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid, PK | |
| `driver_user_id` | uuid, FK → users | |
| `company_id` | uuid, FK → companies | |
| `platform` | text | "ios" or "android" |
| `token` | text | The FCM or APNs device token |
| `is_active` | boolean | Whether this token is still valid |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `trip_sync_log`
Records each offline submission that syncs back from a driver's device.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid, PK | |
| `trip_id` | uuid, FK → driver_trips | |
| `stop_id` | uuid, FK → trip_stops | |
| `driver_user_id` | uuid, FK → users | |
| `company_id` | uuid, FK → companies | |
| `sync_type` | text | "stop_completion", "location_batch", "photo_upload" |
| `payload_summary` | jsonb | Summary of what was synced (not the full data) |
| `status` | text | "received", "processing", "completed", "failed" |
| `error_message` | text | Error details if processing failed |
| `received_at` | timestamptz | When the server received the sync |
| `processed_at` | timestamptz | When processing completed |
| `created_at` | timestamptz | |

---

## Phase 1: Trip Infrastructure (No Mobile)

**Goal:** Get trips flowing from the TMS into Parse-It and visible to dispatchers. No mobile app work yet.

### Phase 1A: Database Tables

Create all core tables needed for trip management:

1. **Create `trip_ingestion_configs` table**
   - All columns as defined above
   - RLS: Only authenticated users with admin/manager role can read/write
   - Scoped by `company_id`

2. **Create `stop_type_workflow_rules` table**
   - All columns as defined above
   - RLS: Only authenticated users with admin/manager role can read/write
   - Scoped by `company_id`
   - Unique constraint on (`ingestion_config_id`, `stop_type_code`, `trip_type`)

3. **Create `driver_trips` table**
   - All columns as defined above
   - RLS: Admins/managers can read all trips for their company; drivers can only read their own assigned trips
   - Index on (`company_id`, `status`), (`driver_user_id`, `status`), (`tms_trip_id`)
   - Check constraint on `status`: must be one of "pending", "in_progress", "completed", "cancelled"

4. **Create `trip_stops` table**
   - All columns as defined above
   - RLS: Same pattern as driver_trips -- admins see all, drivers see their own trip's stops
   - Index on (`trip_id`, `sequence_number`), (`company_id`, `status`)
   - Check constraint on `status`: must be one of "pending", "in_progress", "completed", "skipped", "failed"

5. **Create `trip_sync_log` table**
   - All columns as defined above
   - RLS: Admins can read all; drivers can read their own
   - Index on (`trip_id`), (`driver_user_id`, `created_at`)

6. **Add `employee_number` column to `users` table** (if not already present)
   - Used for matching TMS driver IDs to Parse-It users
   - Text field, nullable, indexed

7. **Add `is_driver` or `role` field to `users` table** (if not already using a role system)
   - Needed to identify which users are drivers vs. admin/dispatchers
   - Check existing user role system first and extend it

### Phase 1B: TMS Polling Edge Function

Create the `tms-poller` edge function:

1. **Function behavior:**
   - Reads the active `trip_ingestion_configs` for the company
   - Calls the TMS API using the configured endpoint and auth
   - Parses the response using the configured `response_mapping`
   - For each trip in the response:
     - Check if the trip already exists (by `tms_trip_id`) -- if so, update it; if not, create it
     - Match the driver using `driver_id_field` → `driver_match_field` on the users table
     - Create/update stop records for each stop in the trip
     - Apply `stop_type_workflow_rules` to assign the correct Execute Flow to each stop
   - Update `last_polled_at` and `last_poll_status` on the config
   - Log any errors

2. **Scheduling:**
   - Use the existing workflow scheduling pattern (pg_cron or the Supabase scheduling mechanism already in use for email monitoring)
   - Poll interval comes from the config

3. **Error handling:**
   - If the TMS API is unreachable, log the error and retry on the next interval
   - If a specific trip fails to parse, skip it and continue with others
   - Track consecutive failures and optionally alert the admin

4. **Trip update handling:**
   - If a trip already exists and the TMS sends updated data:
     - Update trip fields (but never overwrite driver-submitted flow_result_data)
     - Add new stops if the TMS added them
     - Mark stops as cancelled if the TMS removed them (do not delete -- preserve any driver data)
     - Reorder stops if sequence changed (only if the stop has not been completed yet)

### Phase 1C: Trip Ingestion Settings Page

A new settings section in the Parse-It web app where admins configure TMS polling:

1. **TMS Connection Configuration panel:**
   - API spec selector (dropdown of existing API specs)
   - Polling endpoint path input
   - Polling interval selector (5, 10, 15, 30, 60 minutes)
   - Authentication configuration (reuse existing API auth pattern)
   - Field mapping inputs:
     - Driver ID field path (JSON path in the TMS response)
     - Driver match field (dropdown: employee_number, email, username)
     - Trip reference field path
   - Response mapping builder (JSON path mappings from TMS fields to trip/stop fields)
   - Test connection button (calls the TMS API once and shows a preview of the response)
   - Enable/disable toggle
   - Last poll status indicator

2. **Stop Type Routing Rules panel:**
   - Table listing all configured rules
   - Each row: stop type code, label, trip type filter (optional), assigned Execute Flow (dropdown), active toggle
   - Add/edit/delete rules
   - Preview: show which flows are assigned to which stop types

3. **Polling Log panel:**
   - Recent poll history: timestamp, status (success/error), trips found, trips created/updated, errors
   - Useful for troubleshooting TMS connectivity

### Phase 1D: Trip Management Page

A new page in the Parse-It web app for dispatchers to view and manage trips:

1. **Trip list view:**
   - Table with columns: Trip Reference, Type (LTL/TL), Driver, Date, Origin → Destination, Stops (completed/total), Status
   - Filtering: by status, by driver, by date range, by trip type
   - Search: by trip reference number
   - Sorting: by date, by status, by driver name
   - Click a row to open the trip detail view
   - Auto-refresh on an interval (reuse existing inbox auto-refresh pattern)

2. **Trip detail view (slide-out panel or separate page):**
   - Trip header: reference number, type, driver name, scheduled date, overall status
   - Stop timeline: vertical list showing all stops in sequence order
     - Each stop shows: sequence number, stop type icon/label, location name and address, scheduled time, status badge, completion time (if done)
     - Completed stops show a checkmark and a link to view the submitted data
     - Click a stop to expand and see: special instructions, flow result data (if completed), TMS callback status
   - Trip metadata: raw TMS data viewer (collapsible JSON viewer using existing JsonViewer component)
   - Actions:
     - Reassign driver (dropdown of available drivers)
     - Cancel trip
     - Manually mark a stop as skipped

3. **Summary statistics bar:**
   - Total active trips, trips completed today, trips with issues (failed stops, failed TMS callbacks)
   - Quick-filter buttons for common views (Active, Completed Today, Issues)

### Phase 1 Deliverables Checklist
- [ ] All database tables created with proper RLS policies
- [ ] TMS poller edge function deployed and working on a schedule
- [ ] Trip Ingestion Settings page in the admin UI
- [ ] Trip Management page with list and detail views
- [ ] End-to-end test: TMS data comes in → trips and stops created → visible to dispatcher

---

## Phase 2: Driver App (Online Only)

**Goal:** Build the driver mobile app with trip list, trip details, and stop workflow execution. Online only -- no offline support yet. Also build the dispatcher live map.

### Phase 2A: Driver App -- Core Structure

The driver app is a separate section of the existing Parse-It web application, accessed via the mobile QR code connection. It uses a dedicated driver layout (no admin navigation, simplified UI optimized for touch on small screens).

1. **Driver layout component:**
   - Mobile-first responsive design
   - Bottom navigation bar with tabs: Trips, Map (optional for driver), Profile
   - Header showing the company branding (logo from company branding settings)
   - Pull-to-refresh on trip list
   - Connection status indicator (online/offline badge)

2. **Driver authentication:**
   - Driver logs in using existing Parse-It credentials (username/password via the login-with-username edge function)
   - Or connects via QR code scan from the Applications settings page
   - Session persists on the device
   - The app checks the user's role and shows the driver interface if they are a driver

3. **Driver route in the app router:**
   - New route prefix: `/driver/` or `/m/driver/`
   - Sub-routes: `/driver/trips`, `/driver/trips/:tripId`, `/driver/trips/:tripId/stops/:stopId`
   - Protected by role-based route (driver role required)

### Phase 2B: Driver Trip List Screen

1. **Trip list:**
   - Shows all trips assigned to the logged-in driver
   - Grouped or filtered by: Today, Upcoming, Completed
   - Each trip card shows:
     - Trip reference number
     - Trip type badge (LTL / Truckload)
     - Scheduled date and time
     - Origin → Destination (first and last stop locations)
     - Progress indicator: "3 of 6 stops completed"
     - Status badge (pending, in progress, completed)
   - Tap a trip card to open the trip detail screen
   - Pull-to-refresh to check for new/updated trips

2. **Empty state:**
   - "No trips assigned" message with an explanation
   - Shows when the driver has no current trips

3. **Data fetching:**
   - Query `driver_trips` where `driver_user_id = auth.uid()` and status is not "cancelled"
   - Order by `scheduled_date` descending
   - Include a count of completed stops vs. total stops (join or subquery on `trip_stops`)
   - Optional: Supabase realtime subscription so new trips appear automatically

### Phase 2C: Driver Trip Detail Screen

1. **Trip header section:**
   - Trip reference number (large, prominent)
   - Trip type badge
   - Scheduled date
   - Overall status

2. **Stop timeline:**
   - Vertical timeline layout (similar to shipment tracking UIs)
   - Each stop is a node on the timeline showing:
     - Stop number and type icon (pickup icon, delivery icon, terminal icon, etc.)
     - Location name (bold) and address (secondary text)
     - Scheduled time
     - Status: pending (gray), in progress (blue), completed (green), skipped (yellow)
     - If completed: completion timestamp
   - The current/next stop is visually highlighted (larger, different background, "Start" button)
   - Completed stops are visually subdued but tappable to review submitted data

3. **Starting a stop:**
   - Driver taps the "Start" button on the current stop
   - The stop status updates to "in_progress" in the database
   - The assigned Execute Flow launches
   - Trip data from the TMS is injected into the flow context as pre-filled variables:
     - Location name, address, customer reference numbers, piece counts, weights, special instructions
     - This uses the existing variable/template system in Execute Flows
   - When the flow completes:
     - The flow result data is saved to the stop's `flow_result_data` column
     - The stop status updates to "completed" with a timestamp
     - The trip's overall status updates if needed (all stops done → trip completed)
     - The driver returns to the trip detail view to see the next stop

4. **Stop enforcement:**
   - By default, stops should be completed in sequence order
   - The "Start" button only appears on the next pending stop
   - Allow a "Skip" option (with confirmation) for cases where the dispatcher tells the driver to skip a stop
   - Skipped stops record the skip reason and timestamp

### Phase 2D: Execute Flow Integration for Driver Stops

The driver launches an Execute Flow when starting a stop. This reuses the existing `PublicExecutePage` or `ExecuteModal` components, adapted for the driver context:

1. **Flow launching:**
   - When the driver taps "Start" on a stop, load the Execute Flow configuration for the assigned `execute_button_id`
   - Pre-populate flow context variables with trip and stop data from the `tms_raw_data` and stop fields
   - Render the flow in the driver layout (full-screen on mobile)

2. **Flow context variables (available to the flow designer):**
   - `{{trip.reference}}` -- Trip reference number
   - `{{trip.type}}` -- Trip type
   - `{{stop.location_name}}` -- Current stop location name
   - `{{stop.location_address}}` -- Current stop address
   - `{{stop.scheduled_time}}` -- Scheduled time
   - `{{stop.special_instructions}}` -- Special instructions
   - `{{stop.tms_stop_id}}` -- TMS stop ID (for callbacks)
   - `{{stop.tms_data.*}}` -- Access to any field in the stop's raw TMS data
   - `{{trip.tms_data.*}}` -- Access to any field in the trip's raw TMS data

3. **Flow completion handling:**
   - When the flow completes successfully, capture the result data
   - Save it to `trip_stops.flow_result_data`
   - Update the stop and trip statuses
   - Trigger any post-completion steps (TMS callbacks happen through the flow's API call steps)

4. **Photo capture support:**
   - Execute Flows already support file uploads
   - On mobile, the file picker should default to the camera (use `capture="environment"` on the file input for rear camera)
   - Captured photos are uploaded to Supabase Storage and referenced in the flow data
   - For damage reporting: the flow uses conditional visibility (if "damage = yes", show the photo capture group)

5. **Signature capture:**
   - Reuse the existing `SignaturePadModal` component
   - On mobile, the signature pad should be full-width
   - Signatures are saved as images to Supabase Storage

6. **Barcode scanning:**
   - Reuse the existing barcode detection capability (the project already has `barcode-detector` as a dependency)
   - On mobile, the scanner uses the rear camera
   - Scanned values populate the appropriate flow field

### Phase 2E: GPS Location Reporting

1. **Location service in the driver app:**
   - When the driver has an active trip (at least one stop is "in_progress" or the trip is "in_progress"), the app requests GPS permissions and begins location tracking
   - Location updates are sent to the `driver_locations` table via upsert (one row per driver, updated each cycle)
   - Reporting interval: every 30 seconds while moving, every 60 seconds while stationary
   - Movement detection: compare new coordinates to the last reported coordinates; if the distance is less than 50 meters, use the stationary interval
   - Each update includes: latitude, longitude, heading, speed, accuracy, current trip ID, current stop ID
   - When the driver has no active trip, location reporting stops

2. **Location update endpoint:**
   - Direct upsert to `driver_locations` table using the Supabase client
   - RLS policy: drivers can only upsert their own row (`driver_user_id = auth.uid()`)
   - Also insert into `driver_location_history` for route replay (append-only)

3. **Battery and performance considerations:**
   - Use the Geolocation API's `watchPosition` with appropriate `enableHighAccuracy` settings
   - On mobile web: request the `geolocation` permission
   - If the app is running as a PWA or in a WebView, background location may be limited -- document this limitation
   - For native app wrapper (future): use native background location APIs for more reliable tracking

4. **Stale location detection:**
   - A scheduled database function or edge function runs every 2-3 minutes
   - Any `driver_locations` row where `last_reported_at` is older than 5 minutes gets `is_online` set to `false`
   - The dispatcher map uses this flag to show stale indicators

### Phase 2F: Dispatcher Live Map Page

A new page in the Parse-It web app showing real-time driver positions on a map.

1. **Map component:**
   - Full-screen Google Map (using the Google Maps JavaScript API)
   - The Google Maps API key is already available through the existing Google Places integration
   - Map defaults to a view that fits all active driver markers

2. **Driver markers:**
   - Each active driver is shown as a marker on the map
   - Marker appearance:
     - Custom marker icon showing the driver's initials in a colored circle
     - Color indicates status: green (at stop/completing flow), blue (en route), gray (stale/offline)
     - A directional indicator (arrow or chevron) shows the driver's heading
   - Markers update position in real-time using Supabase realtime subscription on the `driver_locations` table
   - Smooth animation: markers slide to new positions rather than jumping (use Google Maps marker animation or CSS transitions)

3. **Driver info popup:**
   - Click a driver marker to see a popup/info window:
     - Driver name
     - Current trip reference and type
     - Current stop: type, location name, status (en route to / working at)
     - Next stop: location name and scheduled time
     - Last updated: "X minutes ago"
     - Link to open the full trip detail in the Trip Management page

4. **Trip route overlay:**
   - When a driver marker is selected, optionally show the driver's planned route:
     - Smaller markers for each stop in the trip (differentiated by stop type)
     - Lines connecting the stops in sequence order
     - Completed stops shown differently from pending stops (e.g., filled vs. outlined)
   - This gives the dispatcher a visual of where the driver has been and where they are heading

5. **Filtering and controls:**
   - Filter by: driver (multi-select), trip type (LTL/TL), status (active/all)
   - Toggle: show/hide planned stop markers
   - Toggle: show/hide route lines
   - A driver list sidebar (collapsible) showing all drivers with their current status, sortable by name or last update time
   - Click a driver in the sidebar to center the map on them

6. **Summary bar:**
   - Total drivers active
   - Total drivers offline/stale
   - Total active trips
   - Drivers at stops vs. en route

7. **Data fetching:**
   - Initial load: query `driver_locations` joined with `driver_trips` and `trip_stops` for the company
   - Real-time: subscribe to changes on `driver_locations` for the company
   - When a driver's position updates, move their marker and update the info popup if open

### Phase 2 Deliverables Checklist
- [ ] Driver layout with mobile-optimized navigation
- [ ] Driver trip list screen with real-time updates
- [ ] Driver trip detail screen with stop timeline
- [ ] Execute Flow launching from stop with trip/stop data injection
- [ ] Photo capture, signature, and barcode scanning working on mobile
- [ ] GPS location reporting while trips are active
- [ ] Driver Locations and Location History tables with RLS
- [ ] Stale location detection (scheduled cleanup)
- [ ] Dispatcher live map page with real-time driver markers
- [ ] Driver info popups with trip context
- [ ] Trip route overlay on the map
- [ ] End-to-end test: trip comes from TMS → driver sees it → completes stops → data flows back → dispatcher sees driver on map

---

## Phase 3: Offline Support

**Goal:** Enable drivers to complete stop workflows without connectivity. All data is cached locally and syncs when the driver comes back online.

### Phase 3A: Flow Definition Pre-Loading

1. **Pre-load trigger:**
   - When a new trip is received (or when the driver opens a trip for the first time while online), the app downloads and caches:
     - The full trip record and all its stop records
     - For each unique `execute_button_id` across all stops: the complete Execute Flow definition (execute_button config, all steps, all form field groups, all fields with their options, visibility conditions, and validation rules)
   - Cache storage: IndexedDB via a lightweight wrapper (or localStorage for small payloads)

2. **Cache structure:**
   - `cached_trips`: keyed by trip ID, stores the full trip and stop data
   - `cached_flows`: keyed by execute_button_id, stores the full flow definition
   - `cache_metadata`: tracks when each item was last synced, enabling staleness detection

3. **Cache invalidation:**
   - When the app comes online, compare cached trip data with the server version
   - If the server version is newer (updated_at is later), re-download the trip data
   - If a flow definition changed, re-download it
   - Completed and synced trips can be purged from the cache after a retention period (e.g., 7 days)

### Phase 3B: Local Form Rendering

1. **Offline form engine:**
   - When the driver starts a stop's flow while offline, the app renders the forms using the cached flow definition
   - The renderer handles:
     - All field types: text, number, dropdown, date, time, boolean, phone, postal code, state/province, file (photo), signature
     - Field groups: displayed in order with proper labels and layout
     - Required field validation
     - Simple conditional visibility: "if field X equals Y, show/hide field Z" (evaluating the driver's own input)
     - Default values from the flow definition
     - Pre-filled values from the trip/stop TMS data

2. **Limitations of offline rendering:**
   - API lookup fields (fields that call an external API for dropdown options) will show a text input instead, with a note that lookup is unavailable offline
   - Server-side branching (steps that depend on an API response to decide the next step) are skipped and queued
   - File uploads (photos, signatures) are saved locally and uploaded during sync
   - These limitations should be documented for operators building driver flows

3. **Local file storage:**
   - Photos captured offline are stored in IndexedDB as blobs
   - Signatures captured offline are stored as base64 data URIs
   - Each stored file is referenced by a unique local ID that maps to the flow field
   - On sync, files are uploaded to Supabase Storage first, then the flow data is submitted with the storage URLs

### Phase 3C: Outbox Queue

1. **Outbox structure:**
   - Stored in IndexedDB
   - Each outbox entry contains:
     - `id`: unique local ID
     - `trip_id`: which trip
     - `stop_id`: which stop
     - `type`: "stop_completion", "location_batch"
     - `payload`: the form data collected by the driver
     - `files`: array of local file references (photos, signatures)
     - `created_at`: when the driver completed the action
     - `sync_status`: "pending", "uploading_files", "submitting", "completed", "failed"
     - `retry_count`: number of sync attempts
     - `last_error`: error message from the most recent failed attempt

2. **Outbox processing:**
   - A background sync service monitors connectivity
   - When online, processes outbox entries in order (oldest first, maintaining stop sequence within a trip):
     a. Upload any associated files to Supabase Storage
     b. Submit the stop completion data to the server (call the execute-button-processor or a dedicated batch endpoint)
     c. Update the stop status on the server
     d. Log the sync in `trip_sync_log`
     e. On success: mark the outbox entry as "completed" and eventually purge it
     f. On failure: increment retry count, save the error, and try again on the next cycle
   - Retry strategy: exponential backoff with a maximum of 5 retries before marking as permanently failed and alerting the driver

3. **Driver-facing outbox UI:**
   - A badge on the driver navigation showing the count of pending outbox entries
   - An outbox screen listing all pending and recently synced entries:
     - Each entry shows: trip reference, stop type, when completed, sync status
     - Failed entries show the error and a "Retry" button
     - Successfully synced entries show a checkmark and the sync time
   - This gives the driver confidence that their work is being saved and sent

### Phase 3D: Two-Way Sync

1. **Outbound sync (driver → server):**
   - As described in Phase 3C above

2. **Inbound sync (server → driver):**
   - When the app comes online, check for trip updates:
     - New trips assigned to this driver (not in local cache)
     - Updated trips (server `updated_at` is newer than cached version)
     - Cancelled trips or stops
   - Conflict resolution:
     - If a stop was cancelled on the server but the driver already completed it offline:
       - Submit the driver's data anyway (do not discard their work)
       - Flag the stop in `trip_sync_log` as "completed_but_cancelled" for dispatcher review
     - If a stop was reordered:
       - Update the sequence numbers in the local cache
       - If the driver completed stops in the old order, that is fine -- the data is still valid
     - If a new stop was added to a trip the driver is working on:
       - Add it to the local cache and show it in the timeline
       - Notify the driver with a banner: "Your trip has been updated -- a new stop was added"

3. **Location batch sync:**
   - While offline, location readings are stored locally (array of lat/lng/timestamp)
   - When online, the batch is sent to `driver_location_history` as a bulk insert
   - The current location updates `driver_locations` with the most recent reading
   - Old location batches are purged from local storage after successful sync

### Phase 3E: Offline Status Indicators

1. **Driver app indicators:**
   - Connection status badge: green dot (online) / red dot (offline) in the header
   - When offline, a persistent banner at the top: "You are offline. Your work is being saved and will sync when you reconnect."
   - Trip and stop data shows a "cached" indicator if it has not been refreshed recently
   - Outbox badge in the navigation

2. **Dispatcher map indicators:**
   - Stale driver markers (no update in 5+ minutes) change to gray with a clock icon
   - Tooltip on stale markers: "Last seen X minutes ago at [location]"
   - Optional: dotted line from last known position to show uncertainty

### Phase 3 Deliverables Checklist
- [ ] Flow definition pre-loading and IndexedDB caching
- [ ] Local form rendering engine handling all field types and simple conditions
- [ ] Local file storage for offline photos and signatures
- [ ] Outbox queue with background sync processing
- [ ] File upload → data submission sync pipeline
- [ ] Retry logic with exponential backoff
- [ ] Two-way sync: trip updates from server, completions from driver
- [ ] Conflict resolution for cancelled/reordered stops
- [ ] Location batch sync
- [ ] Offline status indicators for both driver and dispatcher
- [ ] End-to-end test: driver goes offline → completes stops → comes back online → data syncs → dispatcher sees updated trip and driver position

---

## Phase 4: Push Notifications and Polish

**Goal:** Add real-time alerts for drivers and polish the overall experience.

### Phase 4A: Push Notifications

1. **Push notification infrastructure:**
   - Use Firebase Cloud Messaging (FCM) for both Android and iOS (FCM handles APNs forwarding)
   - Store FCM credentials as Supabase secrets
   - Create a `send-driver-notification` edge function that accepts a driver user ID, title, body, and data payload, looks up the driver's push token, and sends via FCM

2. **Notification triggers:**
   - **New trip assigned:** When the TMS poller creates a new trip and assigns a driver, send a push notification: "New trip assigned: [trip reference] - [origin] → [destination]"
   - **Trip updated:** When the TMS poller updates a trip (new stops added, stops cancelled, schedule change): "Trip [reference] has been updated"
   - **Trip cancelled:** "Trip [reference] has been cancelled"
   - **Dispatcher message:** Future feature -- dispatchers can send a text message to a driver through the Trip Management page, delivered as a push notification

3. **Driver app handling:**
   - When the driver taps a notification, the app opens to the relevant trip detail screen
   - Notifications that arrive while the app is open show as an in-app banner (toast)
   - Push token registration happens on login and is refreshed periodically

4. **Push token management:**
   - Tokens are stored in `driver_push_tokens`
   - On login, the app registers the device token
   - On logout, the token is deactivated
   - If a push send fails with an "invalid token" error, deactivate the token and wait for the driver to re-register on next login

### Phase 4B: Route Replay

1. **Route replay on the Trip Management page:**
   - For completed trips, dispatchers can view the driver's actual route on a map
   - Uses data from `driver_location_history` for the trip
   - Rendered as a colored polyline on the map
   - Stop markers show where the driver actually stopped vs. where they were supposed to
   - Playback controls: a slider to scrub through time, play/pause to animate the driver's movement along the route
   - Useful for: verifying service, investigating disputes, analyzing route efficiency

2. **Data retention:**
   - Location history is purged after a configurable period (default 90 days)
   - A scheduled edge function handles the cleanup
   - Completed trip data (flow results, stop data) is retained longer (or indefinitely) since it may be needed for billing or compliance

### Phase 4C: Driver App Polish

1. **Performance optimizations:**
   - Lazy load trip detail data (only fetch stops when the driver opens a trip)
   - Paginate the trip list (load 20 at a time, with infinite scroll)
   - Compress cached flow definitions to reduce IndexedDB usage
   - Optimize photo capture: resize images before upload (max 2048px on longest side, 80% JPEG quality) to reduce upload time on slow connections

2. **UX improvements:**
   - Haptic feedback on key actions (stop started, stop completed, photo captured) -- if running in a native wrapper
   - Swipe gestures: swipe left on a stop to skip, swipe right to start
   - Trip countdown: "Arriving in approximately X minutes" based on GPS and distance to next stop (requires routing API -- optional)
   - Dark mode support (reuse existing dark mode system)
   - Landscape orientation support for signature capture

3. **Error recovery:**
   - If the app crashes or is force-closed while the driver is completing a flow, auto-save the form state to IndexedDB every 30 seconds
   - On relaunch, detect the interrupted flow and offer to resume from where they left off
   - Display clear error messages for sync failures: "Could not send your [Delivery] data for stop 3. Tap to retry."

4. **Accessibility:**
   - Large touch targets (minimum 48x48px) for all interactive elements
   - High contrast text on all backgrounds
   - Voice-over / screen reader support for trip list and stop timeline
   - Simple, clear language in all labels and messages (drivers may be in a hurry)

### Phase 4D: Admin and Operational Tools

1. **Driver activity dashboard (in Parse-It admin):**
   - Summary view: active drivers, trips in progress, stops completed today, average stop completion time
   - Driver performance: stops per day, average time at stop, on-time percentage
   - Data from `trip_stops` completion timestamps and `driver_location_history`

2. **Alert system:**
   - Configurable alerts for dispatchers:
     - Driver has been at a stop for more than X minutes (possible problem)
     - Driver has gone offline for more than X minutes
     - TMS polling has failed for X consecutive attempts
     - A driver's outbox has failed sync items older than X minutes
   - Alerts shown as notifications in the Parse-It admin UI and optionally sent via email

3. **Bulk operations:**
   - Reassign all of a driver's trips to another driver (in case of driver change)
   - Cancel all stops of a specific type across multiple trips
   - Export trip data to CSV for reporting

### Phase 4 Deliverables Checklist
- [ ] Push notification edge function with FCM integration
- [ ] Push token registration and management
- [ ] Notifications for new trips, updates, and cancellations
- [ ] Route replay on the Trip Management page
- [ ] Location history cleanup function
- [ ] Photo optimization (resize before upload)
- [ ] Form auto-save and crash recovery
- [ ] Driver activity dashboard
- [ ] Configurable dispatcher alerts
- [ ] Bulk trip operations

---

## Technical Notes

### Security Considerations
- All tables use RLS scoped by `company_id` to ensure data isolation between customers
- Drivers can only access their own trips and stops (RLS policy: `driver_user_id = auth.uid()`)
- Drivers can only update their own location (RLS policy on `driver_locations`)
- TMS API credentials should be stored in Supabase secrets, not in the database
- Location data is sensitive -- ensure it is only accessible to authorized users within the same company
- Push notification tokens are device-specific and should be deactivated on logout

### Existing Patterns to Reuse
- **Email monitoring** → TMS polling (same scheduled-function-polls-external-API pattern)
- **Email processing rules** → Stop type workflow rules (same condition-matches-to-action pattern)
- **Execute Flows / execute-button-processor** → Stop workflow execution (same flow engine)
- **QR code mobile connection** → Driver app authentication
- **Company branding** → Driver app theming
- **Inbox page** → Trip Management page (similar list + detail + filtering pattern)
- **Workflow execution logs** → Trip sync logs
- **Google Places / static-map-proxy** → Dispatcher live map (same Google Maps API key)

### Performance Considerations
- `driver_locations` will be updated very frequently (every 30-60 seconds per active driver). Use UPSERT and keep the table small (one row per driver, not append-only)
- `driver_location_history` will grow fast. Partition by month or add a retention cleanup job
- Realtime subscriptions on `driver_locations` should be filtered by `company_id` to avoid cross-company data leakage
- IndexedDB storage on the driver's device should be monitored; warn the driver if it exceeds a threshold (e.g., 100MB from cached photos)

### Future Considerations (Not in Current Scope)
- **Native mobile app wrapper:** Wrapping the web app in a native container (Capacitor, React Native WebView) for better background location, push notifications, and app store distribution
- **Turn-by-turn navigation:** Integration with Google Maps or Waze for driving directions to the next stop
- **ETA calculation:** Using the Google Directions API to estimate arrival times at upcoming stops
- **Geofencing:** Automatically detect when the driver arrives at a stop location and prompt them to start the flow
- **Multi-language support:** Translating the driver interface for drivers who speak different languages
- **Driver chat:** Real-time messaging between driver and dispatcher within the app
- **Electronic logging device (ELD) integration:** Hours of service tracking for regulatory compliance
- **Proof of delivery PDF generation:** Auto-generating a PDF with signature, photos, and timestamps for each delivery
