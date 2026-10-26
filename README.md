# TaskFlow

A small, complete task manager built with React + Vite, Express, and MySQL 8. Create, edit, delete, search, and filter tasks, and switch them between pending and completed. Tasks are stored in MySQL and survive application restarts. The project can be run locally or containerized with Docker and Docker Compose.

## Project layout

```text
taskflow/
├── frontend/
│   ├── public/
│   │   └── favicon.svg
│   ├── src/
│   │   ├── api.js
│   │   ├── App.jsx
│   │   ├── Icon.jsx
│   │   ├── main.jsx
│   │   ├── styles.css
│   │   └── TaskDialog.jsx
│   ├── .env.example
│   ├── Dockerfile
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
├── backend/
│   ├── src/
│   │   ├── app.js
│   │   ├── config.js
│   │   ├── db.js
│   │   ├── server.js
│   │   └── validation.js
│   ├── test/
│   │   ├── api.test.js
│   │   └── mysql.test.js
│   ├── .env.example
│   ├── Dockerfile
│   ├── package.json
│   └── package-lock.json
├── database/
│   └── init.sql
├── docker-compose.yaml
├── .gitignore
└── README.md
```

## Run with Docker Compose

This is the containerized deployment of TaskFlow. It uses three services:

```text
Browser (http://localhost:8080)
  |  loads React static files
  v
Frontend: Nginx (container port 80)

Browser (JavaScript fetch to http://localhost:3000)
  |  REST API requests
  v
Backend: Node.js / Express (container port 3000)
  |  DB_HOST=db, DB_PORT=3306
  v
Database: MySQL 8 (container port 3306)
  |  persistent storage
  v
Docker named volume (db-data)
```

The frontend and backend use separate Dockerfiles. Docker Compose builds and runs the services, provides an internal network, and mounts a named volume for MySQL persistence. The React bundle runs **in the browser**, so its API URL must be reachable from the browser—not merely resolvable inside Docker.

### Prerequisites

- Docker Desktop (or Docker Engine with the Compose plugin) running.
- Available host ports **8080** (frontend) and **3000** (API).
- The `docker-compose.yaml`, both Dockerfiles, and `database/init.sql` present in the repository.

You do **not** need to install Node.js or MySQL locally for the Docker-based workflow.

### Configuration before starting

Check the service names and environment variables in `docker-compose.yaml`:

| Setting | Expected value / meaning |
| --- | --- |
| `DB_HOST` | `db` (the MySQL Compose service name, not `127.0.0.1`) |
| `DB_PORT` | `3306` (MySQL's internal port) |
| `DB_NAME` | `taskflow` (created by `database/init.sql`) |
| `DB_USER` / `DB_PASSWORD` | A MySQL account and matching credentials |
| `MYSQL_ROOT_PASSWORD` | Password for the MySQL root account (development only) |
| `VITE_API_URL` | `http://localhost:3000` for a browser on the same computer |

**Important:** `MYSQL_ROOT_PASSWORD` alone does not create a separate `taskflow_user`. Either create and grant permissions to an application user in your MySQL initialization/setup, or use credentials for an account that actually exists. The original local setup below creates `taskflow_user` for `'localhost'`; a container-to-container connection requires an account allowed to connect from the backend container. Prefer a dedicated least-privilege user instead of root for non-demo environments.

Keep actual passwords and tokens out of Git. Use local, Git-ignored environment files or an appropriate secret manager; never commit production credentials. If your Compose file currently contains a literal demo password, replace it before publishing the repository.

**Frontend build-time setting:** Vite embeds `VITE_API_URL` in the built JavaScript. Set it **before the frontend build** (for example, using a Dockerfile build argument wired through Compose). Setting `VITE_API_URL` only as a runtime environment variable on the Nginx container does not update an already-built React bundle. If your frontend Dockerfile uses the default `http://localhost:3000`, that default works for this local example.

### Start the application

From the project root:

```sh
docker compose config
docker compose up -d --build
```

`config` validates the Compose configuration; `up -d --build` builds the application images and starts the services in the background. After MySQL initialization completes, open:

| Component | URL |
| --- | --- |
| TaskFlow frontend | http://localhost:8080 |
| API health | http://localhost:3000/health |
| API/database readiness | http://localhost:3000/ready |
| Task API | http://localhost:3000/api/tasks |

On a successful setup, `/ready` returns `{"status":"ready","database":"connected"}`. Then create a task in the frontend and refresh the page to confirm persistence.

### Logs, lifecycle, and persistence

```sh
docker compose ps
docker compose logs -f backend
docker compose logs -f db
docker compose down
```

`docker compose down` stops and removes the Compose containers and network, **but retains named volumes** by default. To start the same project again, run `docker compose up -d`.

The database mount `db-data:/var/lib/mysql` persists MySQL files between container recreations. The SQL script mount `./database/init.sql:/docker-entrypoint-initdb.d/init.sql:ro` initializes a **new, empty** MySQL data directory. It is **not** automatically rerun when an existing database volume is reused.

> **Data loss warning:** `docker compose down -v` also removes Compose-managed named volumes, including the database volume. Use it only when you intentionally want to reset the database and lose its stored tasks.

For local development, the backend may also use `./backend:/app` plus `/app/node_modules`: the first is a bind mount for live source files; the second keeps Linux Node.js dependencies separate from any host `node_modules`. These mounts are optional development conveniences, not database storage.

### Docker troubleshooting

- **Frontend loads but tasks fail:** inspect the browser DevTools Network tab, `docker compose logs backend`, and `/ready`. Check `VITE_API_URL`, `DB_NAME`, and database permissions.
- **`/ready` works but `/api/tasks` fails:** connectivity is working, but the `tasks` table or user permissions may be missing. Confirm that `init.sql` initialized the intended database.
- **Database is not ready at startup:** `depends_on` with the short syntax controls startup order, not readiness. Use a database healthcheck with `condition: service_healthy` or application retry logic if necessary.
- **Frontend displays the default Nginx page or missing files:** verify that the frontend Dockerfile copies the Vite build output into `/usr/share/nginx/html`. Avoid a bind mount such as `./dist:/usr/share/nginx/html` unless that host directory actually contains the built files; it can hide files copied into the image.
- **MySQL exits with an invalid downgrade error:** a persistent volume created by a newer MySQL major version cannot simply be opened by an older one. Use a compatible version or perform a supported migration; do not delete a volume containing important data.
- **Host port already allocated:** stop the conflicting process/container or change the **host-side** port mapping. Internal container-to-container MySQL connections still use `db:3306`.

---

## Run without Docker (manual development setup)

The following instructions describe the original local development workflow. They require local Node.js and MySQL installations and do not use the Docker Compose services above.

## Requirements

- Node.js 22.12+ (or a newer supported LTS version) and npm.
- A locally installed, running MySQL 8 server (8.0.16+ for enforced CHECK constraints).
- MySQL command-line client or MySQL Workbench.
- A modern browser.

Check Node.js with `node --version` and npm with `npm --version`. The application uses JavaScript throughout. Install MySQL Community Server from [the official downloads page](https://dev.mysql.com/downloads/mysql/) if needed.

## 1. Initialize MySQL

Open a terminal in the `taskflow` directory. Connect as a MySQL administrator:

```sh
mysql -h 127.0.0.1 -P 3306 -u root -p
```

Enter your local administrator password when prompted. At the `mysql>` prompt, load the initialization script:

```sql
SOURCE database/init.sql;
```

If the client cannot resolve that relative path, use the full path with forward slashes, for example `SOURCE C:/projects/taskflow/database/init.sql;`. In Workbench, open `database/init.sql` and execute the entire script instead.

The script creates the `taskflow` database, its `tasks` table, and three sample tasks. It preserves existing tables and tasks when rerun, and seeds only an empty table. It does not migrate a preexisting incompatible schema.

Create a local application account. Replace the example password with your own password, and use the same value in `backend/.env`:

```sql
CREATE USER IF NOT EXISTS 'taskflow_user'@'localhost'
  IDENTIFIED BY 'replace_with_your_local_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON taskflow.*
  TO 'taskflow_user'@'localhost';
EXIT;
```

If that user already exists, `CREATE USER IF NOT EXISTS` leaves its password unchanged. Use its existing password, or deliberately change it using `ALTER USER`. If you choose a different database name, update both database names in `init.sql`, the grant, and `DB_NAME` to match.

## 2. Configure and start the backend

In a terminal:

```sh
cd backend
npm install
```

Copy `.env.example` to `.env` inside `backend`:

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```sh
# macOS / Linux
cp .env.example .env
```

Edit `backend/.env` to match your own MySQL setup:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=taskflow_user
DB_PASSWORD=replace_with_your_local_password
DB_NAME=taskflow
PORT=3000
```

If a password contains `#`, put the entire value in double quotes so it is not treated as an environment-file comment. Environment variables already set in your shell take precedence over `.env`.

Start the API and leave the terminal open:

```sh
npm run dev
```

For a regular start without file watching, use `npm start`. The server binds to `0.0.0.0`, defaults to port 3000, and logs the listening address. Use `http://localhost:3000` to access it in your browser. Configuration mistakes produce an actionable startup error; a temporarily unavailable database does not prevent HTTP startup.

## 3. Configure and start the frontend

Open a second terminal in `taskflow`:

```sh
cd frontend
npm install
```

Copy `frontend/.env.example` to `frontend/.env` using `Copy-Item .env.example .env` in PowerShell or `cp .env.example .env` on macOS/Linux. Its contents should be:

```dotenv
VITE_API_URL=http://localhost:3000
```

This is the API's base URL; do not append `/api` or `/api/tasks`. It must be reachable by the browser. When using another device, set this to your backend machine's reachable address instead of that device's `localhost`. Restart Vite after changing it. Vite embeds this value in the browser bundle, so never put passwords in `VITE_*` variables.

```sh
npm run dev
```

Visit **http://localhost:5173**. The development server uses port 5173 and reports an error if that port is already occupied.

## 4. Test the application

### In the browser

1. Confirm the three sample tasks appear.
2. Click **New task**, enter a title and optional description, and save.
3. Edit the task using its pencil button. Save the new title, description, or status.
4. Click its checkbox to mark it completed, then click again to return it to pending.
5. Try the Pending and Completed filters, search, and sorting.
6. Reload the page and restart the backend. Your tasks should still exist.
7. Delete your task and confirm the dialog. Reload to confirm it stays deleted.
8. Stop MySQL. `/health` should stay at HTTP 200; `/ready` and task requests should return HTTP 503. The UI shows an error and a Retry button. Restart MySQL and click Retry; the pool reconnects without restarting Express.

### Health and readiness

Open these URLs in a browser:

| Endpoint                           | HTTP status                      | Response                                          |
| ---------------------------------- | -------------------------------- | ------------------------------------------------- |
| `GET http://localhost:3000/health` | 200                              | `{"status":"ok"}`                                 |
| `GET http://localhost:3000/ready`  | 200 when MySQL is reachable      | `{"status":"ready","database":"connected"}`       |
| `GET http://localhost:3000/ready`  | 503 when MySQL cannot be reached | `{"status":"not_ready","database":"unavailable"}` |

`/health` checks the HTTP process. `/ready` executes `SELECT 1` against MySQL; it verifies connectivity, not table initialization. If readiness succeeds but tasks fail, check `DB_NAME`, table initialization, and user permissions.

### API checks in PowerShell

With the backend running:

```powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:3000/ready
Invoke-RestMethod http://localhost:3000/api/tasks

$body = @{ title = 'Test the API'; description = 'Created from PowerShell' } | ConvertTo-Json
$task = Invoke-RestMethod http://localhost:3000/api/tasks -Method Post -ContentType 'application/json' -Body $body

$body = @{ title = 'Edit the API task'; description = 'Updated'; status = 'pending' } | ConvertTo-Json
Invoke-RestMethod "http://localhost:3000/api/tasks/$($task.id)" -Method Put -ContentType 'application/json' -Body $body

Invoke-RestMethod "http://localhost:3000/api/tasks/$($task.id)/status" -Method Patch -ContentType 'application/json' -Body '{"status":"completed"}'
Invoke-RestMethod "http://localhost:3000/api/tasks/$($task.id)" -Method Delete
```

### Automated checks

From `backend`:

```sh
npm test
```

These API tests use an isolated in-memory test double; they check validation, CRUD responses, CORS, errors, and database outage/recovery behavior without requiring MySQL. The running application always uses MySQL.

After initializing and configuring a real local MySQL database, run:

```sh
npm run test:integration
```

This uses `backend/.env` and runs real SQL through the HTTP API. It verifies Unicode, quoted text, unchanged updates, CRUD, and persistence after closing and reopening both the server and pool. It creates a temporary task and deletes it afterward. It does not require the normal backend server to be running, and fails if MySQL or the schema is unavailable.

From `frontend`, verify the production build:

```sh
npm run build
npm run preview
```

Preview serves the built frontend at `http://localhost:4173`; the API and MySQL must also be running. Preview is an optional alternative to the Vite development server.

## Ports and environment variables

| Component                       | Default port | Configuration                                       |
| ------------------------------- | ------------ | --------------------------------------------------- |
| React / Vite development server | 5173         | `frontend/vite.config.js`                           |
| Express REST API                | 3000         | Backend `PORT`; binds to `0.0.0.0`                  |
| MySQL                           | 3306         | MySQL server configuration; match backend `DB_PORT` |
| Optional frontend build preview | 4173         | `npm run preview`                                   |

| Variable       | Used by  | Purpose                                                                                                  |
| -------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `DB_HOST`      | Backend  | MySQL hostname; required                                                                                 |
| `DB_PORT`      | Backend  | MySQL TCP port; defaults to `3306`                                                                       |
| `DB_USER`      | Backend  | MySQL account; required                                                                                  |
| `DB_PASSWORD`  | Backend  | MySQL password; required to be set, may be empty for an explicitly configured passwordless local account |
| `DB_NAME`      | Backend  | Database name; required                                                                                  |
| `PORT`         | Backend  | HTTP listening port; defaults to `3000`                                                                  |
| `VITE_API_URL` | Frontend | Browser-accessible API base URL; defaults to `http://localhost:3000`                                     |

Actual `.env` files are ignored by Git. `.env.example` files document the settings without application credentials. No database credentials are hardcoded in the JavaScript source.

## How the components communicate

```text
Browser (React, localhost:5173)
    │  HTTP fetch / JSON, using VITE_API_URL
    ▼
Express API (localhost:3000, bound to 0.0.0.0)
    │  mysql2 connection pool / parameterized SQL over TCP
    ▼
MySQL 8 (DB_HOST:DB_PORT, database DB_NAME)
```

React's `src/api.js` uses `fetch` to call the REST endpoints. Express enables CORS for local development because the frontend and API use different ports. Only successful writes update UI state; errors stay visible and failed edits preserve form input. The browser never connects to MySQL or receives its credentials.

Express reads its database configuration from the environment and creates a reusable `mysql2/promise` pool. Queries use placeholders for user input. The pool is created without requiring a successful initial connection and can create new connections on later requests after MySQL recovers. Connection and query timeouts are five seconds, with a bounded waiting queue. Failed database operations return a safe HTTP 503 response with `Retry-After: 5`; writes are never automatically retried, so ambiguous network failures do not trigger duplicate inserts. If a write times out, refresh the task list to check whether it reached the database before submitting it again. Shutdown closes HTTP connections and the pool.

## REST API reference

| Method | Path                    | Description              | Success      |
| ------ | ----------------------- | ------------------------ | ------------ |
| GET    | `/health`               | HTTP liveness            | 200          |
| GET    | `/ready`                | MySQL connectivity       | 200          |
| GET    | `/api/tasks`            | List tasks, newest first | 200          |
| GET    | `/api/tasks/:id`        | Retrieve a task          | 200          |
| POST   | `/api/tasks`            | Create a task            | 201          |
| PUT    | `/api/tasks/:id`        | Replace editable fields  | 200          |
| PATCH  | `/api/tasks/:id/status` | Change only the status   | 200          |
| DELETE | `/api/tasks/:id`        | Delete a task            | 204, no body |

POST accepts a required nonblank `title` (up to 200 characters), optional `description` (up to 5,000 characters, defaults to empty), and optional `status` (`pending` by default, or `completed`). PUT requires `title` and `status`; omitted `description` becomes empty. PATCH accepts only `{"status":"completed"}` or `{"status":"pending"}`. Unknown input fields are rejected. IDs and creation dates are generated by MySQL and cannot be changed through the API.

Example task response:

```json
{
  "id": 1,
  "title": "Plan your week",
  "description": "Pick three priorities.",
  "status": "pending",
  "created_at": "2026-10-25T09:00:00.000Z"
}
```

Dates are returned as UTC ISO strings and displayed in the browser's local timezone. Task endpoints return a task object or an array directly. Errors use `{"error":"Human-readable message."}`: HTTP 400 for invalid input, 404 for missing tasks/endpoints, 413 for oversized requests, 503 for database errors, and 500 for unexpected failures. This is a local learning app with a shared task list and no authentication.

## Troubleshooting

- **Cannot reach the API:** check the backend terminal, the port, and `VITE_API_URL`; restart Vite after an environment change.
- **Database unavailable:** start MySQL, verify all `DB_*` settings, and connect with the same host, port, and user using the MySQL client. Check that `init.sql` was executed and the user has the required grants.
- **Port already in use:** stop the process using it, or change the API `PORT` and frontend `VITE_API_URL` together. Vite's port is set in `vite.config.js`.
  For example, set `PORT=43100` in `backend/.env` and `VITE_API_URL=http://localhost:43100` in `frontend/.env`, then restart both applications.
- **`mysql` not recognized:** add MySQL's `bin` directory to PATH or use MySQL Workbench to run the SQL.
- **PowerShell blocks `npm.ps1`:** use `npm.cmd` in place of `npm`.

The optional Google Fonts stylesheet has system font fallbacks. Application functionality does not depend on an external font service.

Framework references: [Vite guide](https://vite.dev/guide/), [Express error handling](https://expressjs.com/en/guide/error-handling/), and [mysql2 documentation](https://sidorares.github.io/node-mysql2/docs).
