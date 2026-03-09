Build your own update package:

1) Put your update logic in update.sh
2) Keep update.sh in package root
3) Create archive (.zip/.tar/.tar.gz/.tgz)
4) Upload in Settings -> System Updates
5) Run first in Dry run mode

Environment variables available in script:
- THOKAN_DRY_RUN=1 for dry-run mode
