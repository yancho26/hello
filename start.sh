#!/bin/bash
# Стартиране на платформата на Linux или macOS.
# Двойно щракване или: ./start.sh

cd "$(dirname "$0")" || exit 1

if ! command -v node > /dev/null 2>&1; then
  echo ""
  echo "  Липсва Node.js."
  echo "  Изтеглете го от https://nodejs.org и го инсталирайте, после стартирайте отново."
  echo ""
  read -r -p "  Натиснете Enter за изход…"
  exit 1
fi

node server.js
