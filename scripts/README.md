# Scripts

Utility scripts for bootstrap, migration orchestration, backup, and restore.

## Available Scripts

- `bootstrap.sh`: Initialize .env with random secrets and create storage directories
- `backup.sh`: Create timestamped backup of database and storage
- `build_update_package.py`: Build a `.tar.gz` update package with `update.sh` and `payload/`
- `publish_update.py`: Publish a package and refresh `latest.json` for a channel
- `publish_and_verify_update.py`: Publish a package and verify manifest/package URLs

Usage:

```bash
./scripts/bootstrap.sh
./scripts/backup.sh
```
