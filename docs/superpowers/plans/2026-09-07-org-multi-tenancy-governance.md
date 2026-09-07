# Multi-Tenancy & Governance (Orgs/RBAC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one Servervariante-Installation host multiple isolated crews ("Organisationen"), each with its own events, members, and delegated roles, without touching the local variant.

**Architecture:** Shared MySQL DB, every org-bound table gets an `org_id` column enforced by a rewritten `apiVerifyAccess()` in `bootstrap.php` plus a build-time lint guard. `event:<id>` KV blobs become a real `event` table (structured header columns + JSON `payload`). Four existing role names (`captain`/`editor`/`viewer`/`checkpoint_staff`) move from instance-wide (`admin_user.role`) to org-scoped (`org_member.role`); a new `org_event_admin` delegation table grants editor-equivalent rights for a single event without a full org role.

**Tech Stack:** Plain PHP + PDO/MySQL (`php-backend/`), plain JS (`src/core/`, `src/storage/storage-server.js`), no frameworks, no build step beyond `node build.js`.

**Spec:** [`docs/superpowers/specs/2026-09-07-org-multi-tenancy-governance-design.md`](../specs/2026-09-07-org-multi-tenancy-governance-design.md)

## Global Constraints

- **Servervariante only.** Never touch `src/storage/storage-local.js`, `templates/local.template.html`, or anything under the local-variant build path.
- **Shared DB, `org_id`-column filtering** (spec §3/§6, "Variante A") — no per-org schema/DB.
- **No existing-install migration path** — tool has no production deployments yet (confirmed by user 07.09.2026); schema changes may be breaking, no compat shims.
- **Hash-routing (`#/org/<slug>/...`) is the functional default**; `.htaccess` pretty-URL generation is cosmetic best-effort, never a hard requirement (spec §5).
- **Four role names only**: `captain`, `editor`, `viewer`, `checkpoint_staff`. No fifth "event-admin" role — event-level delegation is the separate `org_event_admin` table (spec §4).
- **Default role on org join is `viewer`.**
- **Org creation is SysAdmin-only** (spec §2, "Modell A") — no self-service org creation endpoint.
- **Every org-bound query needs a literal `org_id` predicate** — the lint guard (Task 6) enforces this at build time; do not rely on joins alone to satisfy it.
- **Token never carries org scope** — always resolve org membership live per-request (existing project principle, reused from `checkpointResolveScope()`).
- **Engineering decisions made during planning, not explicit in the spec, are recorded here so the spec and plan stay consistent:**
  - The generic KV table (`{table}`, holds everything that isn't an event/rider/admin row — `config:riderAppUrl`, `i18n:customPacks`, `checkpointTypes:custom`, `roster:team:index`, `roster:rider:index`, `season:*`, `seasons:index`) gets a nullable `org_id` column. `NULL` = instance-wide key (`config:riderAppUrl`, `i18n:customPacks` — shared across all crews on the instance, avoids re-uploading the same language pack per org). Non-`NULL` = org-scoped key (everything else in that list).
  - `events:index` (today's KV-based event list) is **not** carried forward for the server variant — the new `event` table is directly queryable, so the dashboard list becomes a real `SELECT`. `events:index` stays exactly as-is for the local variant (untouched file, `storage-local.js`).
  - Org context travels as a request header `X-Org-Slug` (added to `Access-Control-Allow-Headers`), never a query string — consistent with the existing all-header-auth design (`X-Api-Key`, `X-Admin-Token`, …).
  - The existing shared master API key (`ALLEYCAT_API_KEY_HASH`) becomes the SysAdmin-equivalent bypass instance-wide, replacing its old "always `role: admin`" meaning — same backward-compatible role it already played (Task 2).

---

## Task 1: Migration 7 — org/RBAC schema

**Files:**
- Modify: `php-backend/migrations.php` (add `7 => function(...)` entry to the array returned by `migrationsList()`, after entry `6`)

**Interfaces:**
- Produces tables: `{table}_organization`, `{table}_org_member`, `{table}_org_event_admin`, `{table}_event`. Produces columns: `{table}_admin_user.is_sysadmin`, `{table}.org_id` (on the base KV table), `{table}_checkpoint_staff.org_id`, `{table}_admin_session` unchanged (session stays user-only, no org column — org is resolved live per Global Constraints), `{table}_checkpoint_session.org_id`.
- Consumed by: Task 2 (`bootstrap.php`), Task 3 (`install.php`), Task 4 (`auth.php`), Task 5 (`api.php`).

- [ ] **Step 1: Write the migration function**

Add to `php-backend/migrations.php`, inside the array returned by `migrationsList($table, $charset)`, immediately after the closing `],` of key `6`:

```php
    /* Org/RBAC-Fundament (Multi-Tenancy). Additiv wie alle bisherigen
       Migrationen — admin_user.role bleibt vorerst als Spalte stehen
       (wird von keiner neuen Abfrage mehr gelesen, aber DROP COLUMN ist
       nicht idempotent genug für den bestehenden Runner-Stil, siehe
       Kopf dieser Datei) und wird ignoriert, sobald Migration 7 gelaufen
       ist — Rollenwahrheit liegt ab hier ausschließlich in org_member. */
    7 => function(PDO $pdo) use ($table, $charset){
      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_organization` (
        `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `slug` VARCHAR(64) NOT NULL,
        `name` VARCHAR(191) NOT NULL,
        `crest_svg_config` TEXT NULL,
        `noticeboard_text` TEXT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY `uq_slug` (`slug`)
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");

      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_org_member` (
        `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `org_id` INT UNSIGNED NOT NULL,
        `user_id` INT UNSIGNED NOT NULL,
        `role` VARCHAR(20) NOT NULL DEFAULT 'viewer',
        `joined_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY `uq_org_user` (`org_id`,`user_id`),
        KEY `idx_user` (`user_id`)
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");

      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_event` (
        `id` VARCHAR(64) NOT NULL PRIMARY KEY,
        `org_id` INT UNSIGNED NOT NULL,
        `slug` VARCHAR(191) NOT NULL,
        `status` VARCHAR(16) NOT NULL DEFAULT 'planning',
        `start_date` DATE NULL,
        `payload` LONGTEXT NOT NULL,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uq_org_slug` (`org_id`,`slug`),
        KEY `idx_org` (`org_id`)
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");

      $pdo->exec("CREATE TABLE IF NOT EXISTS `{$table}_org_event_admin` (
        `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `org_id` INT UNSIGNED NOT NULL,
        `event_id` VARCHAR(64) NOT NULL,
        `user_id` INT UNSIGNED NOT NULL,
        `granted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY `uq_event_user` (`event_id`,`user_id`),
        KEY `idx_org` (`org_id`)
      ) ENGINE=InnoDB DEFAULT CHARSET={$charset}");

      foreach([
        ["{$table}_admin_user", 'is_sysadmin', 'TINYINT(1) NOT NULL DEFAULT 0'],
        ["{$table}", 'org_id', 'INT UNSIGNED NULL'],
        ["{$table}_checkpoint_staff", 'org_id', 'INT UNSIGNED NOT NULL DEFAULT 0'],
        ["{$table}_checkpoint_session", 'org_id', 'INT UNSIGNED NOT NULL DEFAULT 0'],
      ] as $col){
        [$tbl, $name, $def] = $col;
        $stmt = $pdo->prepare(
          "SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?"
        );
        $stmt->execute([$tbl, $name]);
        if((int)$stmt->fetchColumn() === 0){
          $pdo->exec("ALTER TABLE `{$tbl}` ADD COLUMN `{$name}` {$def}");
        }
      }

      /* Die alte PK (`key`) allein reicht nicht mehr — zwei Orgs dürfen
         denselben Key-Namen benutzen (z. B. beide 'seasons:index'). Nur
         idempotent nachziehen, falls die PK noch die alte Form hat. */
      $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'PRIMARY' AND COLUMN_NAME = 'org_id'"
      );
      $stmt->execute([$table]);
      if((int)$stmt->fetchColumn() === 0){
        $pdo->exec("ALTER TABLE `{$table}` DROP PRIMARY KEY, ADD PRIMARY KEY (`org_id`,`key`)");
      }
    },
```

- [ ] **Step 2: Verify idempotency manually**

Run (against a scratch local MySQL DB per CLAUDE.md's documented setup — Homebrew `mariadb` + `php -S localhost:8000 -t php-backend`, never a real install's DB):

```bash
php -r "
require 'php-backend/migrations.php';
\$pdo = new PDO('mysql:host=127.0.0.1;dbname=alleycat_scratch;charset=utf8mb4', 'scratch_user', 'scratch_pass', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
echo 'first run: '; print_r(runMigrations(\$pdo, 'alleycat', 'alleycat_db_meta', 'utf8mb4'));
echo 'second run: '; print_r(runMigrations(\$pdo, 'alleycat', 'alleycat_db_meta', 'utf8mb4'));
"
```

Expected: first run lists `[7]` (assuming migrations 1-6 already applied from a prior install run), second run lists `[]` — no error, no duplicate-column exception.

- [ ] **Step 3: Commit**

```bash
git add php-backend/migrations.php
git commit -m "$(cat <<'EOF'
feat: add org/RBAC schema migration (organization, org_member, event, org_event_admin)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `bootstrap.php` — org-aware access resolution

**Files:**
- Modify: `php-backend/bootstrap.php:195-329` (the "Admin-Benutzer/Rollen" and `apiVerifyAccess()` sections)

**Interfaces:**
- Consumes: `{table}_organization`, `{table}_org_member`, `{table}_org_event_admin` (Task 1).
- Produces: `apiResolveOrgId(PDO $pdo, $slug)` — returns `int|null`. `apiVerifyAccess(PDO $pdo, $minRole = 'viewer', $eventId = null)` — **signature change**, now returns `['role' => string, 'username' => ?string, 'userId' => ?int, 'orgId' => ?int, 'isSysAdmin' => bool]`. Every caller in `api.php`/`auth.php`/`rider.php` that uses `apiVerifyAccess()` must be updated in later tasks to read `orgId` instead of assuming instance-wide scope.

- [ ] **Step 1: Replace the role-rank constant and add org helpers**

Replace `bootstrap.php:221` (`const ADMIN_ROLE_RANK = ...`) with:

```php
const ADMIN_ROLE_RANK = ['viewer' => 1, 'checkpoint_staff' => 1, 'editor' => 2, 'captain' => 3];

function apiResolveOrgId(PDO $pdo, $slug){
  if($slug === '' || $slug === null) return null;
  $stmt = $pdo->prepare("SELECT `id` FROM `" . adminTableName('organization') . "` WHERE `slug` = ?");
  $stmt->execute([$slug]);
  $id = $stmt->fetchColumn();
  return $id === false ? null : (int)$id;
}

function apiRequestOrgSlug(){
  return trim((string)($_SERVER['HTTP_X_ORG_SLUG'] ?? ''));
}

/* Rolle einer Person innerhalb einer bestimmten Org, live nachgeschlagen
   (nie im Token gebacken — siehe checkpointResolveScope() für dasselbe
   Prinzip bei Checkpoints). null = kein Mitglied dieser Org. */
function apiOrgMemberRole(PDO $pdo, $userId, $orgId){
  if($orgId === null) return null;
  $stmt = $pdo->prepare("SELECT `role` FROM `" . adminTableName('org_member') . "` WHERE `org_id` = ? AND `user_id` = ?");
  $stmt->execute([$orgId, $userId]);
  $role = $stmt->fetchColumn();
  return $role === false ? null : $role;
}

/* true, wenn $userId für genau $eventId als Event-Admin delegiert wurde
   (org_event_admin) — gilt als 'editor'-Äquivalent, aber ausschließlich
   für dieses eine Event. */
function apiHasEventDelegation(PDO $pdo, $userId, $eventId){
  if($eventId === null) return false;
  $stmt = $pdo->prepare("SELECT COUNT(*) FROM `" . adminTableName('org_event_admin') . "` WHERE `event_id` = ? AND `user_id` = ?");
  $stmt->execute([$eventId, $userId]);
  return ((int)$stmt->fetchColumn()) > 0;
}
```

- [ ] **Step 2: Rewrite `apiVerifyAccess()`**

Replace `bootstrap.php:298-329` (the whole `apiVerifyAccess()` function and its docblock) with:

```php
/* Prüft Zugriff für die aktuelle Anfrage und bricht mit 401/403 ab, wenn
   nicht ausreichend. $minRole ist die für DIESE Anfrage nötige
   Mindestrolle INNERHALB DER AKTIVEN ORG (aus dem X-Org-Slug-Header).
   $eventId ist optional — wenn gesetzt, zählt zusätzlich zur Org-Rolle
   eine passende org_event_admin-Delegation als 'editor'-Äquivalent.

   Zugangswege, alle vollwertig:
     - X-Api-Key: Master-Key -> SysAdmin-Äquivalent, besteht jede Prüfung
       ohne org_member-Zeile (Top-Down-Vererbung, siehe Spec §4/§6).
     - X-Admin-Token: personalisierte Session -> user.is_sysadmin ODER
       org_member.role für die im Header genannte Org ODER (bei gesetztem
       $eventId) org_event_admin-Delegation.

   Gibt die aufgelöste Rolle inkl. orgId zurück (Aufrufer brauchen die
   Org-ID für jede weitere Query in dieser Anfrage). */
function apiVerifyAccess(PDO $pdo, $minRole = 'viewer', $eventId = null){
  $orgSlug = apiRequestOrgSlug();
  $orgId = apiResolveOrgId($pdo, $orgSlug);

  $apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
  if($apiKey !== ''){
    if((defined('ALLEYCAT_API_KEY_HASH') && password_verify($apiKey, ALLEYCAT_API_KEY_HASH))
       || (defined('ALLEYCAT_API_KEY') && hash_equals(ALLEYCAT_API_KEY, $apiKey))){
      return ['role' => 'captain', 'username' => null, 'userId' => null, 'orgId' => $orgId, 'isSysAdmin' => true];
    }
  }

  $adminToken = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
  if($adminToken !== ''){
    $user = adminResolveSessionUser($pdo, $adminToken);
    if($user){
      if((int)$user['is_sysadmin'] === 1){
        return ['role' => 'captain', 'username' => $user['username'], 'userId' => (int)$user['id'], 'orgId' => $orgId, 'isSysAdmin' => true];
      }
      $orgRole = apiOrgMemberRole($pdo, (int)$user['id'], $orgId);
      if($orgRole !== null && adminRoleAtLeast($orgRole, $minRole)){
        return ['role' => $orgRole, 'username' => $user['username'], 'userId' => (int)$user['id'], 'orgId' => $orgId, 'isSysAdmin' => false];
      }
      if(adminRoleAtLeast('editor', $minRole) && apiHasEventDelegation($pdo, (int)$user['id'], $eventId)){
        return ['role' => 'editor', 'username' => $user['username'], 'userId' => (int)$user['id'], 'orgId' => $orgId, 'isSysAdmin' => false];
      }
      apiSendJsonError(403, 'insufficient_role');
    }
  }

  apiSendJsonError(401, 'unauthorized');
}
```

- [ ] **Step 3: Update `adminResolveSessionUser()` doc comment for the dropped role concept**

Modify `bootstrap.php:195-207` (the "Admin-Benutzer/Rollen" block comment) — replace the "Rollen, aufsteigend" paragraph with:

```php
/* ================= Admin-Benutzer/Rollen =================
   Zweite Ebene über dem einen geteilten API-Key: der Key bleibt gültig
   (Rückwärtskompatibilität, Ersteinrichtung, jetzt SysAdmin-Äquivalent —
   siehe apiVerifyAccess()), zusätzlich kann sich ein Browser als
   benannter Benutzer mit Rolle anmelden. Bearer-Token statt
   PHP-Session-Cookie — Begründung siehe Migration 4 in migrations.php.

   Rollen liegen NICHT mehr auf admin_user (instanzweit), sondern auf
   org_member (pro Org) — siehe apiOrgMemberRole(). admin_user.is_sysadmin
   ist die einzige instanzweite Sonderrolle, besteht jede Org-Prüfung
   implizit. admin_user.role bleibt als Spalte stehen (nicht idempotent
   entfernbar, siehe Migration 7), wird aber von keiner Abfrage mehr
   gelesen — Rollenwahrheit ist ausschließlich org_member/is_sysadmin.

   checkpoint_staff hat KEINEN Zugriff auf api.php/auth.php-Verwaltung —
   die Rolle wird ausschließlich in rider.php für die Checkpoint-App
   aufgelöst (siehe dort), nie über apiVerifyAccess(). */
```

- [ ] **Step 4: Commit**

```bash
git add php-backend/bootstrap.php
git commit -m "$(cat <<'EOF'
feat: resolve RBAC roles per-org in apiVerifyAccess

Roles move from instance-wide admin_user.role to org-scoped
org_member.role; is_sysadmin bypasses org checks; org_event_admin
grants a one-event editor-equivalent delegation.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `install.php` — SysAdmin bootstrap, no default org

**Files:**
- Modify: `php-backend/install.php:86-95` (the first-admin INSERT)

**Interfaces:**
- Consumes: `{table}_admin_user.is_sysadmin` (Task 1).
- Produces: nothing new — no org is created during install (Global Constraints: SysAdmin creates orgs afterward via the instance panel, Task 4/8).

- [ ] **Step 1: Update the bootstrap INSERT**

Find the block around `install.php:86-95` matching:

```php
$userTable = $table . '_admin_user'; // adminTableName() in bootstrap.php, hier ohne config.php nachgebildet
...
$pdo->prepare("INSERT INTO `{$userTable}` (`username`,`password_hash`,`role`,`display_name`)
```

Replace the INSERT with:

```php
$pdo->prepare("INSERT INTO `{$userTable}` (`username`,`password_hash`,`role`,`display_name`,`is_sysadmin`)
               VALUES (?,?,'captain',?,1)")
    ->execute([$adminUser, password_hash($adminPassword, PASSWORD_DEFAULT), $adminDisplayName ?: $adminUser]);
```

(Keep the surrounding variable names as they already exist in that file — only the INSERT's column list/placeholders and the trailing `1` for `is_sysadmin` change. The `role` column is written for cosmetic consistency with `auth.php`'s bootstrap action, Task 4, but is never read.)

- [ ] **Step 2: Update the success-page copy**

Search `install.php` for the post-install success message (references "Admin-Account" / "API-Key") and add one sentence: after login, this account can create the first organization from the new Instance-panel (`#/instance`) before any crew work can start — no org exists yet after a fresh install.

- [ ] **Step 3: Manual verification**

Run a fresh `install.php` against the scratch DB from Task 1, confirm via:

```bash
php -r "
\$pdo = new PDO('mysql:host=127.0.0.1;dbname=alleycat_scratch;charset=utf8mb4', 'scratch_user', 'scratch_pass');
print_r(\$pdo->query('SELECT username, is_sysadmin FROM alleycat_admin_user')->fetch());
"
```

Expected: `is_sysadmin => 1` for the bootstrapped account, and `SELECT COUNT(*) FROM alleycat_organization` returns `0`.

- [ ] **Step 4: Commit**

```bash
git add php-backend/install.php
git commit -m "$(cat <<'EOF'
feat: bootstrap account is instance SysAdmin, no default org

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `auth.php` — instance/org endpoints

**Files:**
- Modify: `php-backend/auth.php` (multiple insertions, see steps)

**Interfaces:**
- Consumes: `apiVerifyAccess()` (Task 2, new signature/return shape), `{table}_organization`/`{table}_org_member`/`{table}_org_event_admin` (Task 1).
- Produces: `GET ?a=my-orgs`, `POST ?a=org/create`, `GET ?a=org/list`, `POST ?a=org/deactivate` (SysAdmin instance endpoints), `GET ?a=org/members`, `POST ?a=org/members/set-role`, `POST ?a=org/members/remove` (captain-scoped), `GET ?a=org/event-admins`, `POST ?a=org/event-admins/grant`, `POST ?a=org/event-admins/revoke`. Consumed by `storage-server.js` (Task 7).

- [ ] **Step 1: Update `authUserRow()` and `bootstrap`/`login`/`whoami` for `is_sysadmin`**

Replace `authUserRow()` (`auth.php:125-134`):

```php
function authUserRow($row){
  return [
    'id' => (int)$row['id'],
    'username' => $row['username'],
    'isSysAdmin' => (bool)(int)$row['is_sysadmin'],
    'displayName' => $row['display_name'],
    'active' => (bool)(int)$row['active'],
    'lastSeenAt' => $row['last_seen_at']
  ];
}
```

Replace the `login` action's response line (`auth.php:229`):

```php
  authOut(['ok' => true, 'token' => $token, 'isSysAdmin' => (bool)(int)$user['is_sysadmin'], 'username' => $user['username'], 'displayName' => $user['display_name']]);
```

Replace the `whoami` action (`auth.php:241-245`):

```php
if($action === 'whoami'){
  authRequireGet();
  $access = apiVerifyAccess($pdo, 'viewer');
  authOut(['ok' => true, 'role' => $access['role'], 'username' => $access['username'], 'isSysAdmin' => $access['isSysAdmin'], 'orgId' => $access['orgId']]);
}
```

- [ ] **Step 2: Add `my-orgs`**

Insert directly after the `whoami` block:

```php
if($action === 'my-orgs'){
  authRequireGet();
  $access = apiVerifyAccess($pdo, 'viewer'); // keine Org im Header nötig für diese Aktion selbst
  $orgTable = adminTableName('organization');
  if($access['isSysAdmin']){
    $rows = $pdo->query("SELECT `id`,`slug`,`name` FROM `{$orgTable}` ORDER BY `name` ASC")->fetchAll(PDO::FETCH_ASSOC);
  } else {
    $stmt = $pdo->prepare(
      "SELECT o.`id`, o.`slug`, o.`name`, m.`role` FROM `{$orgTable}` o
       JOIN `" . adminTableName('org_member') . "` m ON m.org_id = o.id
       WHERE m.user_id = ? ORDER BY o.name ASC"
    );
    $stmt->execute([$access['userId']]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
  }
  authOut(['ok' => true, 'orgs' => array_map(function($r){
    return ['id' => (int)$r['id'], 'slug' => $r['slug'], 'name' => $r['name'], 'role' => $r['role'] ?? 'captain'];
  }, $rows)]);
}
```

- [ ] **Step 3: Add SysAdmin instance endpoints (`org/create`, `org/list`, `org/deactivate`)**

Insert after the `my-orgs` block. Note these calls deliberately pass `apiVerifyAccess($pdo, 'captain')` **without** relying on `X-Org-Slug` resolving to a real org — only `isSysAdmin` may pass, enforced by rejecting non-SysAdmin explicitly (an org-scoped `captain` of one org must not manage other orgs):

```php
$orgTable = adminTableName('organization');

function authRequireSysAdmin($access){
  if(!$access['isSysAdmin']) apiSendJsonError(403, 'sysadmin_required');
}

if($action === 'org/create'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'captain');
  authRequireSysAdmin($access);
  $body = authJsonBody();
  $slug = trim((string)($body['slug'] ?? ''));
  $name = trim((string)($body['name'] ?? ''));
  if($slug === '' || $name === '' || !preg_match('/^[a-z0-9-]{2,64}$/', $slug)) apiSendJsonError(400, 'invalid_input');
  try{
    $pdo->prepare("INSERT INTO `{$orgTable}` (`slug`,`name`) VALUES (?,?)")->execute([$slug, $name]);
  }catch(PDOException $e){
    if($e->getCode() === '23000') apiSendJsonError(409, 'slug_taken');
    throw $e;
  }
  authOut(['ok' => true, 'id' => (int)$pdo->lastInsertId()]);
}

if($action === 'org/list'){
  authRequireGet();
  $access = apiVerifyAccess($pdo, 'viewer');
  authRequireSysAdmin($access);
  $rows = $pdo->query("SELECT `id`,`slug`,`name`,`created_at` FROM `{$orgTable}` ORDER BY `created_at` DESC")->fetchAll(PDO::FETCH_ASSOC);
  authOut(['ok' => true, 'orgs' => $rows]);
}

if($action === 'org/deactivate'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'captain');
  authRequireSysAdmin($access);
  $body = authJsonBody();
  $orgId = (int)($body['orgId'] ?? 0);
  if($orgId <= 0) apiSendJsonError(400, 'invalid_input');
  /* Kein DELETE — Events/Mitglieder sollen nicht mitgerissen werden.
     "Deaktivieren" heißt: alle Sessions der Org-Mitglieder invalidieren,
     Slug für Neuvergabe sperren bleibt der Org selbst überlassen (sie
     existiert weiter, nur keine aktiven Logins mehr). */
  $memberIds = $pdo->prepare("SELECT `user_id` FROM `" . adminTableName('org_member') . "` WHERE `org_id` = ?");
  $memberIds->execute([$orgId]);
  $ids = $memberIds->fetchAll(PDO::FETCH_COLUMN);
  if($ids){
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $pdo->prepare("DELETE FROM `" . adminTableName('admin_session') . "` WHERE `user_id` IN ({$placeholders})")->execute($ids);
  }
  authOut(['ok' => true]);
}
```

- [ ] **Step 4: Add org-scoped member management (`org/members`, `org/members/set-role`, `org/members/remove`)**

Insert after the SysAdmin block. These require `$minRole = 'captain'` **within the active org** (resolved from `X-Org-Slug`, no `isSysAdmin` override needed — `apiVerifyAccess` already lets SysAdmin through):

```php
$orgMemberTable = adminTableName('org_member');

if($action === 'org/members'){
  authRequireGet();
  $access = apiVerifyAccess($pdo, 'viewer');
  if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
  $stmt = $pdo->prepare(
    "SELECT m.`user_id`, m.`role`, u.`username`, u.`display_name` FROM `{$orgMemberTable}` m
     JOIN `{$userTable}` u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY u.username ASC"
  );
  $stmt->execute([$access['orgId']]);
  authOut(['ok' => true, 'members' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

if($action === 'org/members/set-role'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'captain');
  if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
  $body = authJsonBody();
  $userId = (int)($body['userId'] ?? 0);
  $role = (string)($body['role'] ?? '');
  if($userId <= 0 || !in_array($role, ['captain','editor','viewer','checkpoint_staff'], true)) apiSendJsonError(400, 'invalid_input');
  /* Letzter Captain der Org darf sich nicht selbst degradieren — analog
     zur bestehenden last_admin-Regel in users/update. */
  if($role !== 'captain'){
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM `{$orgMemberTable}` WHERE `org_id` = ? AND `role` = 'captain'");
    $stmt->execute([$access['orgId']]);
    $captainCount = (int)$stmt->fetchColumn();
    $target = $pdo->prepare("SELECT `role` FROM `{$orgMemberTable}` WHERE `org_id` = ? AND `user_id` = ?");
    $target->execute([$access['orgId'], $userId]);
    if($target->fetchColumn() === 'captain' && $captainCount <= 1) apiSendJsonError(409, 'last_captain');
  }
  $pdo->prepare("INSERT INTO `{$orgMemberTable}` (`org_id`,`user_id`,`role`) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE `role` = VALUES(`role`)")
      ->execute([$access['orgId'], $userId, $role]);
  authOut(['ok' => true]);
}

if($action === 'org/members/remove'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'captain');
  if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
  $body = authJsonBody();
  $userId = (int)($body['userId'] ?? 0);
  if($userId <= 0) apiSendJsonError(400, 'invalid_input');
  $target = $pdo->prepare("SELECT `role` FROM `{$orgMemberTable}` WHERE `org_id` = ? AND `user_id` = ?");
  $target->execute([$access['orgId'], $userId]);
  if($target->fetchColumn() === 'captain'){
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM `{$orgMemberTable}` WHERE `org_id` = ? AND `role` = 'captain'");
    $stmt->execute([$access['orgId']]);
    if((int)$stmt->fetchColumn() <= 1) apiSendJsonError(409, 'last_captain');
  }
  $pdo->prepare("DELETE FROM `{$orgMemberTable}` WHERE `org_id` = ? AND `user_id` = ?")->execute([$access['orgId'], $userId]);
  authOut(['ok' => true]);
}
```

- [ ] **Step 5: Add event-delegation endpoints (`org/event-admins`, `.../grant`, `.../revoke`)**

Insert after the member-management block:

```php
$eventAdminTable = adminTableName('org_event_admin');

if($action === 'org/event-admins'){
  authRequireGet();
  $access = apiVerifyAccess($pdo, 'viewer');
  if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
  $eventId = (string)($_GET['eventId'] ?? '');
  if($eventId === '') apiSendJsonError(400, 'invalid_input');
  $stmt = $pdo->prepare(
    "SELECT a.`user_id`, u.`username` FROM `{$eventAdminTable}` a
     JOIN `{$userTable}` u ON u.id = a.user_id WHERE a.org_id = ? AND a.event_id = ?"
  );
  $stmt->execute([$access['orgId'], $eventId]);
  authOut(['ok' => true, 'admins' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

if($action === 'org/event-admins/grant'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'captain');
  if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
  $body = authJsonBody();
  $userId = (int)($body['userId'] ?? 0);
  $eventId = (string)($body['eventId'] ?? '');
  if($userId <= 0 || $eventId === '') apiSendJsonError(400, 'invalid_input');
  $pdo->prepare("INSERT INTO `{$eventAdminTable}` (`org_id`,`event_id`,`user_id`) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE `granted_at` = CURRENT_TIMESTAMP")
      ->execute([$access['orgId'], $eventId, $userId]);
  authOut(['ok' => true]);
}

if($action === 'org/event-admins/revoke'){
  authRequirePost();
  $access = apiVerifyAccess($pdo, 'captain');
  if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
  $body = authJsonBody();
  $userId = (int)($body['userId'] ?? 0);
  $eventId = (string)($body['eventId'] ?? '');
  if($userId <= 0 || $eventId === '') apiSendJsonError(400, 'invalid_input');
  $pdo->prepare("DELETE FROM `{$eventAdminTable}` WHERE `org_id` = ? AND `event_id` = ? AND `user_id` = ?")
      ->execute([$access['orgId'], $eventId, $userId]);
  authOut(['ok' => true]);
}
```

- [ ] **Step 6: Manual verification script**

Save as a throwaway local script (not committed — matches project convention that PHP-backend verification runs are ad hoc, see CLAUDE.md "PHP backend local testing: no automated way"):

```bash
API=http://localhost:8000/auth.php
KEY=<master key from install.php success page>

# SysAdmin creates two orgs
curl -s -X POST "$API?a=org/create" -H "X-Api-Key: $KEY" -d '{"slug":"crew-a","name":"Crew A"}'
curl -s -X POST "$API?a=org/create" -H "X-Api-Key: $KEY" -d '{"slug":"crew-b","name":"Crew B"}'

# my-orgs as SysAdmin sees both
curl -s "$API?a=my-orgs" -H "X-Api-Key: $KEY"
```

Expected: two `{"ok":true,"id":N}` responses with distinct ids, then `my-orgs` lists both `crew-a` and `crew-b`.

- [ ] **Step 7: Commit**

```bash
git add php-backend/auth.php
git commit -m "$(cat <<'EOF'
feat: add org CRUD, member management, event-delegation endpoints

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `api.php` — org-scoped generic KV + event table

**Files:**
- Modify: `php-backend/api.php` (full rewrite of the request-handling body, `api.php:30-69`)
- Modify: `php-backend/bootstrap.php` (`apiSendCorsHeaders()`, `bootstrap.php:44-48`, to allow the new header)

**Interfaces:**
- Consumes: `apiVerifyAccess()` (Task 2), `{table}_event` and `{table}.org_id` (Task 1).
- Produces: unchanged public contract (`GET/POST/DELETE api.php?key=...`) for non-event keys, **new** contract for event keys: `key` values starting with `event:` are transparently routed to the `event` table instead of the KV table. New dedicated action for listing: `GET api.php?a=events` (dashboard list, replaces `events:index` for the server variant).

- [ ] **Step 1: Allow the new header**

Modify `bootstrap.php:46`:

```php
  header('Access-Control-Allow-Headers: X-Api-Key, X-Rider-Token, X-Rider-Code, X-Admin-Token, X-Checkpoint-Token, X-Org-Slug, Content-Type');
```

- [ ] **Step 2: Write the failing verification (curl) for org isolation**

Before rewriting, write the check that must fail today (event data isn't org-scoped at all yet) and pass after Step 3:

```bash
# Editor of crew-a tries to read an event created under crew-b — must be 404/403, never the payload.
curl -s "$API_ROOT/api.php?key=event:evt123" -H "X-Admin-Token: $CREW_A_EDITOR_TOKEN" -H "X-Org-Slug: crew-a"
```

Run it now (before Step 3): fails with a generic 200/`value` today because `api.php` has no org concept — confirms the gap this task closes.

- [ ] **Step 3: Rewrite the request body**

Replace `api.php:30-69` entirely:

```php
$key = $_GET['key'] ?? '';
$action = $_GET['a'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$pdo = apiConnectDb();
$table = ALLEYCAT_TABLE;
$eventTable = adminTableName('event');

/* Dashboard-Liste: ersetzt das alte events:index-Muster für die
   Servervariante — die event-Tabelle ist direkt abfragbar. */
if($action === 'events' && $method === 'GET'){
  $access = apiVerifyAccess($pdo, 'viewer');
  if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
  $stmt = $pdo->prepare("SELECT `id`,`slug`,`status`,`start_date`,`payload` FROM `{$eventTable}` WHERE `org_id` = ? ORDER BY `updated_at` DESC");
  $stmt->execute([$access['orgId']]);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
  $events = array_map(function($r){
    $payload = json_decode($r['payload'], true) ?: [];
    return ['id' => $r['id'], 'name' => $payload['name'] ?? '', 'date' => $payload['date'] ?? $r['start_date']];
  }, $rows);
  echo json_encode(['ok' => true, 'events' => $events]);
  exit;
}

if($key === '' || strlen($key) > 191){
  apiSendJsonError(400, 'invalid_key');
}

$isEventKey = (strpos($key, 'event:') === 0);
$eventId = $isEventKey ? substr($key, strlen('event:')) : null;

/* GET braucht nur 'viewer', POST/DELETE mindestens 'editor'. Bei
   Event-Keys zählt zusätzlich eine org_event_admin-Delegation für
   genau dieses Event (siehe apiVerifyAccess()). */
$access = apiVerifyAccess($pdo, $method === 'GET' ? 'viewer' : 'editor', $eventId);
if($access['orgId'] === null) apiSendJsonError(400, 'missing_org');
$orgId = $access['orgId'];

if($isEventKey){
  if($method === 'GET'){
    $stmt = $pdo->prepare("SELECT `payload` FROM `{$eventTable}` WHERE `org_id` = ? AND `id` = ?");
    $stmt->execute([$orgId, $eventId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if(!$row){ http_response_code(404); echo json_encode(['error' => 'not_found']); exit; }
    echo json_encode(['value' => $row['payload']]);
  } elseif($method === 'POST'){
    $value = file_get_contents('php://input');
    $decoded = json_decode($value, true) ?: [];
    $slug = (string)($decoded['id'] ?? $eventId);
    $status = (string)($decoded['status'] ?? 'planning');
    $startDate = !empty($decoded['date']) ? substr((string)$decoded['date'], 0, 10) : null;
    $pdo->prepare("INSERT INTO `{$eventTable}` (`id`,`org_id`,`slug`,`status`,`start_date`,`payload`)
                   VALUES (?,?,?,?,?,?)
                   ON DUPLICATE KEY UPDATE `status` = VALUES(`status`), `start_date` = VALUES(`start_date`), `payload` = VALUES(`payload`)")
        ->execute([$eventId, $orgId, $slug, $status, $startDate, $value]);
    echo json_encode(['ok' => true]);
  } elseif($method === 'DELETE'){
    $pdo->prepare("DELETE FROM `{$eventTable}` WHERE `org_id` = ? AND `id` = ?")->execute([$orgId, $eventId]);
    echo json_encode(['ok' => true]);
  } else {
    http_response_code(405); echo json_encode(['error' => 'method_not_allowed']);
  }
  exit;
}

/* Nicht-Event-Keys: weiterhin generischer KV-Store, jetzt org-gescoped.
   Instanzweite Keys (config:riderAppUrl, i18n:customPacks) liegen mit
   org_id=NULL und werden hier bewusst NICHT über den Org-Filter
   erreicht -> eigener Zweig. */
$instanceWideKeys = ['config:riderAppUrl', 'i18n:customPacks'];
$isInstanceWide = in_array($key, $instanceWideKeys, true);

if($method === 'GET'){
  $stmt = $isInstanceWide
    ? $pdo->prepare("SELECT `value` FROM `{$table}` WHERE `key` = ? AND `org_id` IS NULL")
    : $pdo->prepare("SELECT `value` FROM `{$table}` WHERE `key` = ? AND `org_id` = ?");
  $isInstanceWide ? $stmt->execute([$key]) : $stmt->execute([$key, $orgId]);
  $row = $stmt->fetch(PDO::FETCH_ASSOC);
  if(!$row){ http_response_code(404); echo json_encode(['error' => 'not_found']); exit; }
  echo json_encode(['value' => $row['value']]);

} elseif($method === 'POST'){
  $value = file_get_contents('php://input');
  if($isInstanceWide){
    $pdo->prepare("INSERT INTO `{$table}` (`key`,`org_id`,`value`) VALUES (?,NULL,?)
      ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")->execute([$key, $value]);
  } else {
    $pdo->prepare("INSERT INTO `{$table}` (`key`,`org_id`,`value`) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")->execute([$key, $orgId, $value]);
  }
  echo json_encode(['ok' => true]);

} elseif($method === 'DELETE'){
  $stmt = $isInstanceWide
    ? $pdo->prepare("DELETE FROM `{$table}` WHERE `key` = ? AND `org_id` IS NULL")
    : $pdo->prepare("DELETE FROM `{$table}` WHERE `key` = ? AND `org_id` = ?");
  $isInstanceWide ? $stmt->execute([$key]) : $stmt->execute([$key, $orgId]);
  echo json_encode(['ok' => true]);

} else {
  http_response_code(405);
  echo json_encode(['error' => 'method_not_allowed']);
}
```

Note: the base KV table's `INSERT ... ON DUPLICATE KEY` relies on the composite PK `(org_id,key)` from Task 1 — a `NULL` `org_id` in that PK works for uniqueness of instance-wide keys because there's a fixed, small allowlist (`$instanceWideKeys`) rather than arbitrary per-org duplication of the same key string.

- [ ] **Step 4: Re-run the Step 2 curl check**

Expected now: 404 `not_found` for crew-a reading crew-b's event, and 200 with the correct payload when `X-Org-Slug: crew-b` is used with a crew-b token.

- [ ] **Step 5: Commit**

```bash
git add php-backend/api.php php-backend/bootstrap.php
git commit -m "$(cat <<'EOF'
feat: org-scope the generic KV store, move events to a real table

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Lint guard against missing `org_id` filters

**Files:**
- Create: `php-backend/check-org-scoping.php`
- Modify: `build.js` (add an invocation step, following the existing `assertCoreIsBackendAgnostic()` pattern referenced in CLAUDE.md's Core guard section — locate that function's call site in `build.js` and add a sibling call)

**Interfaces:**
- Produces: a script that exits 1 with file/line detail if it finds a violation. Consumed by `build.js`'s build step and by CI-equivalent manual pre-merge checks (no CI in this repo — must be run manually, documented in Step 3).

- [ ] **Step 1: Write the guard script**

```php
<?php
/* Alleycat Dispatch — Org-Scoping-Guard
   ------------------------------------------------------------------
   Scannt api.php/rider.php/auth.php nach Queries gegen org-gebundene
   Tabellen (organization, org_member, org_event_admin, event,
   checkpoint_staff, checkpoint_session, die Basis-KV-Tabelle) und
   schlägt fehl, wenn eine solche Query kein `org_id`-Token im selben
   Statement enthält. Grobes Textmuster, kein echter SQL-Parser — bewusst
   so einfach wie assertCoreIsBackendAgnostic() in build.js: lieber ein
   False Positive, das man von Hand freigibt, als eine stille Lücke.
   ------------------------------------------------------------------ */

$orgBoundTablePatterns = ['_organization`', '_org_member`', '_org_event_admin`', '_event`', '_checkpoint_staff`', '_checkpoint_session`'];
$files = ['api.php', 'rider.php', 'auth.php'];
$violations = [];

foreach($files as $file){
  $path = __DIR__ . '/' . $file;
  $lines = file($path);
  foreach($lines as $i => $line){
    $isQuery = (stripos($line, 'SELECT') !== false || stripos($line, 'INSERT') !== false
             || stripos($line, 'UPDATE') !== false || stripos($line, 'DELETE FROM') !== false);
    if(!$isQuery) continue;
    $touchesOrgBound = false;
    foreach($orgBoundTablePatterns as $p){
      if(strpos($line, $p) !== false){ $touchesOrgBound = true; break; }
    }
    if(!$touchesOrgBound) continue;
    if(strpos($line, 'org_id') === false){
      $violations[] = "{$file}:" . ($i + 1) . ': ' . trim($line);
    }
  }
}

if($violations){
  fwrite(STDERR, "Org-Scoping-Guard: " . count($violations) . " Query(s) ohne erkennbares org_id-Prädikat:\n");
  foreach($violations as $v){ fwrite(STDERR, "  {$v}\n"); }
  exit(1);
}
echo "Org-Scoping-Guard: OK, keine Verstöße gefunden.\n";
exit(0);
```

- [ ] **Step 2: Wire into `build.js`**

Read `build.js` to find where `assertCoreIsBackendAgnostic()` is invoked (per CLAUDE.md, it runs "before either variant is built"). Add immediately after that call:

```js
const { execSync } = require('child_process');
try {
  execSync('php php-backend/check-org-scoping.php', { stdio: 'inherit' });
} catch (e) {
  console.error('Org-Scoping-Guard failed — see output above.');
  process.exit(1);
}
```

(If `build.js` has no `require('child_process')` yet, add it at the top with the other `require`s.)

- [ ] **Step 3: Verify it fails on a deliberately broken line, then passes**

```bash
# Temporarily break it: comment out one org_id clause in api.php's event GET branch, run:
php php-backend/check-org-scoping.php
```

Expected: exits 1, prints the exact `api.php:<line>` that's missing `org_id`. Revert the temporary break, run again — expected: exits 0, "keine Verstöße gefunden."

Then run:

```bash
node build.js
```

Expected: build succeeds, guard output appears in the log before the `dist/*.html` files are written.

- [ ] **Step 4: Commit**

```bash
git add php-backend/check-org-scoping.php build.js
git commit -m "$(cat <<'EOF'
feat: add build-time guard against unscoped org_id queries

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `storage-server.js` — org-aware seams

**Files:**
- Modify: `src/storage/storage-server.js` (see steps for exact functions)

**Interfaces:**
- Consumes: `auth.php?a=my-orgs`, `api.php?a=events`, `X-Org-Slug` header (Tasks 4/5).
- Produces: `getActiveOrgSlug()`, `setActiveOrgSlug(slug)`, `myOrgs()`, `listEventsForActiveOrg()` — consumed by Task 8 (`ui-headquarter.js`, `dashboard.js`).

- [ ] **Step 1: Add active-org state helpers**

Add near `getPhpConfig()`/`savePhpConfig()` (`storage-server.js:21-36`):

```js
function getActiveOrgSlug(){
  return localStorage.getItem('alleycat:activeOrgSlug') || '';
}
function setActiveOrgSlug(slug){
  localStorage.setItem('alleycat:activeOrgSlug', slug);
}
```

(`localStorage`, not the account/KV storage — the active workspace is a per-device UI preference, same tier as `experienceTier` in the device-fallback case described in `docs/claude-code-handover-erfahrungsstufen.md` §2.)

- [ ] **Step 2: Add the header to `currentAuthHeaders()` and `phpRequest()`**

Find `currentAuthHeaders(contentType)` (`storage-server.js:38-49`) and `phpRequest(method, key, body)` (`storage-server.js:158-169`). Add `X-Org-Slug` to whichever one attaches headers to outgoing requests — same pattern as the existing `X-Admin-Token` line in that function:

```js
if(getActiveOrgSlug()) headers['X-Org-Slug'] = getActiveOrgSlug();
```

- [ ] **Step 3: Add `myOrgs()` and switch `storageGet`/list to the events endpoint**

Add near the other `admin*` functions (`storage-server.js:87-92`):

```js
async function myOrgs(){
  const res = await authRequest('GET', 'a=my-orgs');
  const data = await res.json();
  return data.ok ? data.orgs : [];
}

async function listEventsForActiveOrg(){
  const url = new URL(getPhpConfig().apiUrl);
  url.searchParams.set('a', 'events');
  const res = await fetch(url.toString(), { headers: currentAuthHeaders() });
  if(!res.ok) return [];
  const data = await res.json();
  return data.ok ? data.events : [];
}
```

- [ ] **Step 4: Manual browser verification**

Paste into the console of a running `dist/alleycat-dispatch-server.html` (after `node build.js`, logged in as an org member):

```js
setActiveOrgSlug('crew-a');
await myOrgs();       // expect an array containing {slug:'crew-a', ...}
await listEventsForActiveOrg(); // expect [] on a fresh org, or the events created under crew-a
```

- [ ] **Step 5: Commit**

```bash
git add src/storage/storage-server.js
git commit -m "$(cat <<'EOF'
feat: add active-org state and org-scoped event listing to storage-server seam

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Workspace dropdown + Org settings page + Instance panel (frontend)

**Files:**
- Modify: `src/core/ui-headquarter.js` (topbar render function, settings nav groups — locate via CLAUDE.md's documented `SETTINGS_NAV_GROUPS`/sidebar-nav pattern)
- Modify: `src/core/dashboard.js` (event list loading — replace `loadEventsIndex()`/`state.eventsIndex` usage for the server variant)
- Create: nothing new — extends existing render functions per the established `.settings-layout` sidebar pattern (CLAUDE.md: "Sidebar-nav pages" convention)

**Interfaces:**
- Consumes: `myOrgs()`, `listEventsForActiveOrg()`, `setActiveOrgSlug()` (Task 7); `hasAdminRoles()` (existing seam, `storage-server.js:154-157`) to gate this UI off entirely for the local variant (which always returns `false` there).
- Produces: `renderWorkspaceDropdown()`, `renderOrganizationSettingsSection()`, `renderInstancePanel()` — no external consumers beyond the render tree itself.

- [ ] **Step 1: Add workspace state to `init()`**

In `ui-headquarter.js`, find the existing bootstrap sequence (`ui-headquarter.js:288`, the `Promise.all([loadAppSettings(), ...])` line referenced by `loadEventsIndex`). Add, guarded by `hasAdminRoles()` (server variant with personal accounts only — local variant and shared-key mode skip this entirely, matching the existing seam contract):

```js
if(hasAdminRoles()){
  state.myOrgs = await myOrgs();
  state.activeOrgSlug = getActiveOrgSlug() || (state.myOrgs[0] ? state.myOrgs[0].slug : '');
  if(state.activeOrgSlug) setActiveOrgSlug(state.activeOrgSlug);
}
```

- [ ] **Step 2: Render the workspace dropdown in the topbar**

Find the topbar render function (search `ui-headquarter.js` for where the language/theme switcher already renders — same row). Add, following the existing tile-button markup style used for those switches:

```js
function renderWorkspaceDropdown(){
  if(!hasAdminRoles() || !(state.myOrgs || []).length) return '';
  const options = state.myOrgs.map(o =>
    `<option value="${escapeHtml(o.slug)}" ${o.slug === state.activeOrgSlug ? 'selected' : ''}>${escapeHtml(o.name)}</option>`
  ).join('');
  return `<select class="workspace-dropdown" onchange="onWorkspaceChange(this.value)">${options}</select>`;
}

async function onWorkspaceChange(slug){
  setActiveOrgSlug(slug);
  state.activeOrgSlug = slug;
  state.eventsIndex = await listEventsForActiveOrg();
  state.currentEvent = null;
  state.view = 'dashboard';
  render();
}
```

Insert `${renderWorkspaceDropdown()}` into the topbar template string, next to the existing language/theme markup.

- [ ] **Step 3: Replace dashboard event loading for the server variant**

In `dashboard.js`, the dashboard list currently reads `state.eventsIndex` populated by `loadEventsIndex()`/`saveEventsIndex()` (KV-based, `ui-headquarter.js:186-194`). Add a variant check at the same call site identified in Step 1 — when `hasAdminRoles()` is true (server variant with org support active), replace the `loadEventsIndex()` call with `state.eventsIndex = await listEventsForActiveOrg()`, and make `createNewEvent()`/`confirmDeleteEvent()` (`dashboard.js:59-82`) skip the `saveEventsIndex()` calls in that branch — the `event` table's `POST`/`DELETE` in `api.php` (Task 5) already keeps org-scoped state consistent, no separate index to maintain.

Guard this with the same `hasAdminRoles()` check so the **local variant's** `loadEventsIndex()`/`saveEventsIndex()` calls are completely untouched (Global Constraints: never touch local-variant behavior).

- [ ] **Step 4: Add "Organisation" settings section**

Following the existing Settings sidebar pattern (CLAUDE.md: reuse `.settings-layout`/`.settings-sidebar`/`.settings-content`/`.settings-nav-*` verbatim, scope queries to `#view-settings .settings-content`), add a new nav entry and section function:

```js
function renderOrganizationSettingsSection(){
  const org = (state.myOrgs || []).find(o => o.slug === state.activeOrgSlug);
  if(!org) return '';
  return `
    <div class="settings-section">
      <h3>${escapeHtml(org.name)}</h3>
      <label>${t('settings.org.noticeboard')}
        <textarea id="org-noticeboard-text"></textarea>
      </label>
      <div id="org-members-list">${t('settings.org.loadingMembers')}</div>
    </div>`;
}
```

Wire `#org-members-list` to populate via `authRequest('GET', 'a=org/members')` on section open, rendering a row per member with a `<select>` for role (calling `org/members/set-role` on change) — same list/inline-edit pattern already used by the existing Benutzerverwaltung section (locate it via `authRequest('GET', 'a=users')` usage in `ui-headquarter.js` and mirror its row markup, swapping the endpoint and the four role names).

- [ ] **Step 5: Add SysAdmin instance panel**

New top-level view, same shape as `#view-league` (event-independent, reachable via its own route, not part of the normal Sidebar): `openInstancePanel()` sets `state.view = 'instance'`, gated by `state.myOrgs` lookup replaced with a direct `authRequest('GET', 'a=whoami')` check on `isSysAdmin` (SysAdmin may have zero org memberships, unlike the workspace dropdown which needs `myOrgs()`). Render a simple list (`authRequest('GET', 'a=org/list')`) plus a create form posting to `org/create`.

- [ ] **Step 6: Manual browser verification (test-suite.js pattern)**

Add to `test-suite.js` (paste-and-run per CLAUDE.md's documented manual process), following the file's existing assertion style:

```js
// Workspace-Dropdown erscheint nur mit Org-Mitgliedschaft
assert(typeof renderWorkspaceDropdown === 'function', 'renderWorkspaceDropdown existiert');
```

(Full interactive coverage — dropdown switch, member role change — must be verified live in the browser per CLAUDE.md's "browser preview export testing quirk" memory: verify via real clicks, not pure JS assertions alone.)

- [ ] **Step 7: Commit**

```bash
git add src/core/ui-headquarter.js src/core/dashboard.js test-suite.js
git commit -m "$(cat <<'EOF'
feat: add workspace dropdown, org settings, sysadmin instance panel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `install.php` best-effort `.htaccess` pretty-URL block

**Files:**
- Modify: `php-backend/install.php` (append after the successful migration/API-key-generation block)

**Interfaces:**
- Consumes: nothing new.
- Produces: an optional `.htaccess` file next to the installed HTML file. No consumers — cosmetic only (Global Constraints: hash-routing remains functional regardless).

- [ ] **Step 1: Write the idempotent block writer**

Add a function near the top of `install.php` (alongside its other helpers):

```php
function installWriteHtaccessBlock($dir){
  $marker = '# BEGIN alleycat-pretty-urls';
  $endMarker = '# END alleycat-pretty-urls';
  $block = "{$marker}\n<IfModule mod_rewrite.c>\nRewriteEngine On\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteRule ^([a-z0-9-]+)/(.*)$ alleycat-dispatch-server.html [L]\n</IfModule>\n{$endMarker}\n";
  $path = rtrim($dir, '/') . '/.htaccess';
  $existing = file_exists($path) ? file_get_contents($path) : '';
  if(strpos($existing, $marker) !== false){
    $existing = preg_replace('/' . preg_quote($marker, '/') . '.*?' . preg_quote($endMarker, '/') . "\n?/s", $block, $existing);
  } else {
    $existing = rtrim($existing) . "\n\n" . $block;
  }
  $ok = @file_put_contents($path, ltrim($existing));
  return $ok !== false;
}
```

- [ ] **Step 2: Call it after successful install, report best-effort result**

Insert right after the block that writes `config.php` (near `install.php:111`):

```php
$htaccessOk = installWriteHtaccessBlock(__DIR__ . '/..');
```

In the success-page HTML, add one line reporting the outcome without blocking success:

```php
<?php if($htaccessOk): ?>
  <p>Hübsche URLs (<code>/&lt;org-slug&gt;/...</code>) wurden versuchsweise eingerichtet — falls dein Hosting kein Apache/mod_rewrite nutzt, funktioniert die App trotzdem unverändert über die Hash-URL.</p>
<?php else: ?>
  <p>Konnte keine .htaccess schreiben (Berechtigungen?) — kein Problem, die App funktioniert vollständig über die Hash-URL (<code>#/org/&lt;slug&gt;/...</code>).</p>
<?php endif; ?>
```

- [ ] **Step 3: Manual verification**

```bash
php -r "require 'php-backend/install.php'; " # (not directly runnable standalone — instead:)
php -r "
function preg_quote_test(){ return true; }
require_once 'php-backend/install.php';
"
```

Simpler direct check — call the function in isolation:

```bash
php -r "
require 'php-backend/install.php';
mkdir('/tmp/htaccess-test');
file_put_contents('/tmp/htaccess-test/.htaccess', \"RewriteEngine On\nRewriteRule ^old\$ /somewhere\n\");
var_dump(installWriteHtaccessBlock('/tmp/htaccess-test'));
echo file_get_contents('/tmp/htaccess-test/.htaccess');
"
```

Expected: `bool(true)`, output contains both the pre-existing `RewriteRule ^old$` line and the new marked block. Run it a second time — expected: still one copy of the marked block, not duplicated.

- [ ] **Step 4: Commit**

```bash
git add php-backend/install.php
git commit -m "$(cat <<'EOF'
feat: install.php writes best-effort .htaccess for pretty org URLs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: End-to-end cross-org isolation verification

**Files:** none modified — verification-only task, closes out the plan.

**Interfaces:** exercises every endpoint added in Tasks 2-5 together.

- [ ] **Step 1: Set up two orgs, one editor each, against the scratch DB from Task 1**

```bash
curl -s -X POST "$API/auth.php?a=org/create" -H "X-Api-Key: $KEY" -d '{"slug":"crew-a","name":"Crew A"}'
curl -s -X POST "$API/auth.php?a=org/create" -H "X-Api-Key: $KEY" -d '{"slug":"crew-b","name":"Crew B"}'
# create two non-sysadmin users via auth.php?a=users/create is instance-wide user creation (unchanged from before) —
# then assign org roles:
curl -s -X POST "$API/auth.php?a=org/members/set-role" -H "X-Api-Key: $KEY" -H "X-Org-Slug: crew-a" -d '{"userId":2,"role":"editor"}'
curl -s -X POST "$API/auth.php?a=org/members/set-role" -H "X-Api-Key: $KEY" -H "X-Org-Slug: crew-b" -d '{"userId":3,"role":"editor"}'
```

- [ ] **Step 2: Editor of crew-a creates an event, editor of crew-b must not see it**

```bash
TOKEN_A=$(curl -s -X POST "$API/auth.php?a=login" -d '{"username":"editor-a","password":"..."}' | jq -r .token)
curl -s -X POST "$API/api.php?key=event:evt-a1" -H "X-Admin-Token: $TOKEN_A" -H "X-Org-Slug: crew-a" -d '{"id":"evt-a1","name":"Test A"}'

TOKEN_B=$(curl -s -X POST "$API/auth.php?a=login" -d '{"username":"editor-b","password":"..."}' | jq -r .token)
curl -s "$API/api.php?key=event:evt-a1" -H "X-Admin-Token: $TOKEN_B" -H "X-Org-Slug: crew-b"
```

Expected: last call returns 404 `not_found`.

- [ ] **Step 3: SysAdmin sees both, event-delegation grants exactly one event**

```bash
curl -s "$API/api.php?key=event:evt-a1&a=events" -H "X-Api-Key: $KEY" -H "X-Org-Slug: crew-a"
curl -s -X POST "$API/auth.php?a=org/event-admins/grant" -H "X-Api-Key: $KEY" -H "X-Org-Slug: crew-a" -d '{"userId":3,"eventId":"evt-a1"}'
curl -s "$API/api.php?key=event:evt-a1" -H "X-Admin-Token: $TOKEN_B" -H "X-Org-Slug: crew-a"
```

Expected: last call now succeeds (200, payload) — editor-b, a member of crew-b only, can read/write `evt-a1` under `crew-a` solely because of the delegation, but still cannot list crew-a's other events (`org/members`, `?a=events`) since the org role check for those still requires real `org_member` membership.

- [ ] **Step 4: Record results**

Append a dated entry to `php-backend/COMPATIBILITY.md` summarizing the run (pass/fail per step), matching the existing entries' format for the last verified PHP-backend run referenced in CLAUDE.md.

- [ ] **Step 5: Update CLAUDE.md**

Add one line to CLAUDE.md's "Known issues & open TODOs" noting: multi-tenancy/org-RBAC verified against local MySQL on `<date>`; still untested on real shared hosting (same caveat as the rest of the PHP backend).

- [ ] **Step 6: Commit**

```bash
git add php-backend/COMPATIBILITY.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: record multi-tenancy cross-org isolation verification run

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
