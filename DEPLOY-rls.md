# Row-Level Security (RLS) — deploy

## O que é
Segunda trava de isolamento de tenant, no próprio Postgres: toda tabela com `empresa_id` (43)
tem uma política que só deixa passar linhas da empresa do contexto da requisição. Se um dia um
`WHERE empresa_id` for esquecido no código, o banco barra. Perfis `central_admin`, `loja` e
motoboy ficam presos à própria empresa; `super_admin`, cron, migrations e login não têm contexto
(política permissiva).

## Pré-requisito OBRIGATÓRIO: usuário do banco não pode ser superuser
Superuser **ignora RLS** — ficaria tudo aparentemente ok e sem proteção nenhuma. Verifique:
```sql
SELECT current_user, rolsuper FROM pg_roles WHERE rolname = current_user;
```
- `rolsuper = f` → pode ligar.
- `rolsuper = t` (padrão do Postgres do Railway) → crie um papel de aplicação e troque a `DATABASE_URL`:
```sql
CREATE ROLE logix_app LOGIN PASSWORD '<senha forte>' NOSUPERUSER;
GRANT CONNECT ON DATABASE railway TO logix_app;
GRANT USAGE, CREATE ON SCHEMA public TO logix_app;
GRANT ALL ON ALL TABLES IN SCHEMA public TO logix_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO logix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO logix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO logix_app;
-- as tabelas continuam do dono antigo; FORCE ROW LEVEL SECURITY já garante a política para o dono também.
```
Na `DATABASE_URL` da API e do worker, troque usuário/senha por `logix_app`.

## Ordem
1. Deploy do pacote (a migration 0004 cria as políticas — **sem efeito** enquanto `RLS_ENABLED` estiver desligado).
2. Confira/crie o papel não-superuser e troque a `DATABASE_URL`. Redeploy. Painel e app funcionando normalmente.
3. `RLS_ENABLED=true` na API (e no worker). Redeploy. Log de boot: `RLS ativo e efetivo`. Se aparecer
   `RLS ativo mas NÃO efetivo`, o usuário ainda é superuser — volte ao passo 2. `/health/ready` mostra
   `rls: { ativo, efetivo, superuser }` para conferir a qualquer momento.
4. Teste: login como central_admin de um cliente → listar entregas, mapa, concluir corrida pelo app, financeiro. Qualquer tela vazia inesperada ou erro `42501` (insufficient privilege) → me mande o `reqId`; é uma query que roda com contexto de uma empresa tocando dado de outra (o que o RLS existe para pegar).

## Custo
1 round-trip extra por checkout de conexão (`set_config`), ~1 ms na mesma região.

## Rollback
`RLS_ENABLED=false` + redeploy (imediato). Para remover as políticas: `npm run migrate:down`.
