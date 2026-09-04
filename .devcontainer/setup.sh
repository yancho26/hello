#!/bin/bash
# Подготвя средата в Codespaces: създава примерен регистър в отделна папка.
# Изпълнява се веднъж, при създаването на средата.
set -e
cd "$(dirname "$0")/.."

echo "Създаване на примерни данни за демонстрация…"
DATA_DIR=./demo-data node scripts/demo-data.js --force

echo
echo "Проверка, че всичко работи:"
node --test 2>&1 | grep -E '^# (tests|pass|fail)' || true
