# Database

PostgreSQL schema, migrations, and seed data.

## Files

- `schema.sql`: initial DDL for core entities.
- `seed.sql`: baseline roles and optional bootstrap admin.

## Usage

```bash
psql -U thokan -d thokan_cloud -f database/schema.sql
psql -U thokan -d thokan_cloud -f database/seed.sql
```
