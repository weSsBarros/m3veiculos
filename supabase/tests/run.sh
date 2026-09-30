#!/usr/bin/env bash
# Testes de segurança do banco num Postgres local descartável.
#
# Uso: supabase/tests/run.sh
# Precisa de um Postgres acessível pelo psql (variáveis PGHOST, PGPORT, PGUSER
# como de costume; o usuário precisa poder criar bancos e papéis). Cria o banco
# "dom_security_test", instala o schema.sql como numa loja nova, roda de novo
# (loja que atualiza), cadastra duas lojas com equipe e dados, roda o schema.sql
# mais uma vez com esses usuários já cadastrados e confere as permissões.
# Sai com código 1 se algum teste falhar.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
DB="${TEST_DB:-dom_security_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$DIR/supabase_stub.sql" >/dev/null
for run in instalacao reexecucao; do
  "${PSQL[@]}" -d "$DB" -f "$DIR/../schema.sql" >/dev/null 2>"$DIR/.schema-$run.log" || { cat "$DIR/.schema-$run.log"; exit 1; }
done
"${PSQL[@]}" -d "$DB" -f "$DIR/seed.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$DIR/../schema.sql" >/dev/null 2>"$DIR/.schema-com-usuarios.log" || { cat "$DIR/.schema-com-usuarios.log"; exit 1; }
rm -f "$DIR"/.schema-*.log

OUT="$("${PSQL[@]}" -d "$DB" -f "$DIR/security_test.sql")"
echo "$OUT"
if echo "$OUT" | grep -q "^ FAIL"; then
  exit 1
fi
