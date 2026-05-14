# Docker Setup

This project can run with Docker Compose using one backend container and one PostgreSQL container.

## Start

```powershell
docker compose up --build
```

The backend will be available at:

```text
http://localhost:3000
```

PostgreSQL will be available locally on:

```text
localhost:5432
```

## Check The App

```powershell
Invoke-RestMethod http://localhost:3000/health
```

Expected result:

```json
{
  "status": "ok",
  "db": "connected"
}
```

## Stop

```powershell
docker compose down
```

## Reset Database Data

The compose setup uses a named volume, so database data survives normal restarts.

To remove the containers and delete the database volume:

```powershell
docker compose down -v
```

## Notes

The backend container uses `DB_HOST=postgres` because containers connect to each other by service name. The local `.env` file can still use `DB_HOST=localhost` when running the backend directly on your machine.
