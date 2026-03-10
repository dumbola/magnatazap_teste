# PROJECT RULES & CONSTRAINTS

This file contains critical rules that MUST be followed in all future changes. Do not ignore these constraints.

## 0. PRIMARY OBJECTIVE (MAXIMIZATION)
*   **Goal**: Maximize the number of leads dispatched per instance/number.
*   **Strategy**: Continuously improve logic by analyzing WhatsApp data structures and behaviors.
*   **Tactics**: Seek methods to bypass or work around WhatsApp's limitations (rules) to increase throughput while maintaining instance longevity. Always prioritize volume and delivery success.

## 1. Instance Lifecycle (No Zombies)
*   **Rule**: An instance MUST NEVER remain in a "Zombie" state (exist in DB/Memory but dead/unusable).
*   **Specific Trigger**: If a Pairing Code or QR Code expires (Timeout/408) and the instance **was not yet authenticated** (no active session), it MUST be immediately destroyed and wiped.
*   **Constraint**: Never leave an unauthenticated instance in "CONNECTING" status indefinitely.

## 2. Lead Status Strictness
*   **Rule**: The system must operate with a **Strict Status Set** for leads.
*   **Allowed Statuses**:
    1.  `PENDING`: The lead is waiting to be processed or is retrying.
    2.  `SENT`: The message was successfully dispatched.
    3.  `FAILED`: **ONLY** for `Invalid Number` (Permanent Error).
*   **Constraint**:
    *   Technical errors (Timeouts, Proxies, Connection Failures) MUST NOT mark a lead as `FAILED`. They must remain `PENDING` (or be retried).
    *   Do not pollute the UI/DB with validation errors other than "Invalid Number".

## 3. General Stability
*   **Rule**: Always prefer resilience.
    *   Conflict (401) errors are **Recoverable**. Never wipe a session for a Conflict.
    *   Connection Failures (401) are **Recoverable**. Never wipe a session for a Connection Failure.

## 4. Data Consistency (The "Hybrid ID" Rule)
*   **Context**: The system migrated from String SessionIDs to UUIDs.
*   **Rule**: When calculating statistics (e.g., Sent Counts), **ALWAYS** aggregate data using BOTH the `UUID` and the `SessionID`.
*   **Constraint**: Never assume data is purely new or purely legacy. The Dashboard must reflect success regardless of the ID format used at the time of sending.

## 5. Error Classification Strategy (Innocent Until Proven Guilty)
*   **Rule**: A connection error is **Transient** by default.
*   **Constraint**: Only explicit `LOGGED_OUT` (from WhatsApp) or `403 FORBIDDEN` (Ban) events are fatal. Everything else (401 Conflict, 408 Timeout, 500 Stream) must trigger a **RETRY**, not a session wipe.
*   **Goal**: Prevent "Self-Denial of Service" where the system kills healthy instances due to network hiccups.

## 6. Smart Maximization (Speed != Suicide)
*   **Rule**: To achieve the Primary Objective (Maximize Volume), we must avoid the "Spam Filter".
*   **Constraint**: High throughput is achieved by **Parallel Efficiency**, not by removing safety delays.
    *   Use **Jitter** (Randomness) in all delays. Fixed timers = Bot detection.
    *   Keep "Typing" states active during processing to mimic human engagement.
    *   **Recovery IS Speed**: A restart takes 20 seconds. Avoiding a restart (by handling a 401 correctly) saves more time than reducing a message delay by 100ms. Prioritize uptime over raw burst speed.
