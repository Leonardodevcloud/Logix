# Logix — Notas de Arquitetura (multi-tenant)

Documento de decisões de design. Mantido junto ao código para não se perder.

---

## Hierarquia de 3 níveis

```
PLATAFORMA (você — super_admin)
 └── CENTRAL = empresa (tenant, white-label, paga a Logix)
      ├── BRANDING ........... empresa_branding (1:1 com a central)
      ├── FROTA DE MOTOBOYS .. motoboys.empresa_id (pool compartilhado)
      └── LOJAS .............. lojas.empresa_id (clientes da central)
           ├── usuários da loja (perfil 'loja', login próprio)
           ├── endereços de coleta (enderecos_salvos.loja_id, vários)
           └── ENTREGAS (entregas.loja_id)
```

### Perfis (usuarios.perfil)
- `super_admin` — dono da plataforma. Vê todas as empresas. empresa_id = NULL.
- `central_admin` — dono da central. Opera a empresa inteira, cadastra lojas. loja_id = NULL.
- `loja` — usuário da loja-cliente. Vê SÓ as próprias entregas. loja_id preenchido.
- `motoboy` — app do entregador.
- `cliente` — LEGADO, equivale a 'loja'. Mantido no CHECK durante a transição.

### Isolamento (middleware/tenant.js)
- super_admin → escopa empresa via header X-Empresa-Id
- central_admin → travado na empresa; pode filtrar loja via x-loja-id (opcional)
- loja → travado em empresa_id E loja_id (ambos do token JWT)

---

## White-label

**Decisão: branding só na central (Cenário A).**

O branding está ancorado em `empresa_branding` (PK = empresa_id). As lojas **herdam
automaticamente** a identidade visual da central — o tema é resolvido por empresa_id,
então toda loja daquela central usa a mesma cor/logo/domínio.

Racional: a loja é cliente da central, não da Logix. A marca que ela vê é a da central.

*Se um dia precisar de marca por loja (Cenário B):* criar `loja_branding` (PK loja_id)
e fazer o resolvedor de tema dar override do branding da empresa quando houver um
registro de loja. O frontend já lê o tema de um único ponto (`/branding/tema`), então
bastaria o backend mesclar empresa ← loja antes de devolver.

---

## Motoboys

**Decisão atual: frota compartilhada da central.**

`motoboys.empresa_id` — qualquer motoboy da central pode atender qualquer loja dela.
A atribuição de entrega (filas) escolhe entre todos os motoboys da empresa.

### ROADMAP — motoboy fixo/preferencial por loja (futuro)

Quando for implementar "definir motoboy para loja específica":

**Modelagem sugerida (não-destrutiva):**
- Nova tabela `loja_motoboys (loja_id, motoboy_id, tipo)` onde `tipo` ∈
  ('exclusivo', 'preferencial'). Tabela de vínculo N:N — um motoboy pode servir
  várias lojas, uma loja pode ter vários motoboys preferenciais.
- Manter `motoboys.empresa_id` como está (o motoboy continua pertencendo à central).
  O vínculo com loja é uma camada ADICIONAL, não substitui o pool.

**Lógica de atribuição (filas):**
- `exclusivo`: a loja só pode usar motoboys vinculados a ela.
- `preferencial`: a atribuição automática prioriza os vinculados; se nenhum disponível,
  cai para o pool geral da central.
- Sem vínculo: comportamento atual (qualquer motoboy da central).

**Pontos de toque no código:**
- `filas` (atribuir / atribuir-auto / distribuir) — filtrar/priorizar por loja_motoboys.
- Tela de motoboys (frontend) — UI para vincular motoboy ↔ loja.
- Tela de lojas — aba "Motoboys da loja".

Isso fica para uma fase futura. Registrado aqui para não se perder.

---

## Migração / dados

- Migration `lojas.migration.js` cria a tabela e adiciona loja_id em usuarios/entregas/
  enderecos_salvos, além de migrar perfil 'cliente' → 'loja' (idempotente).
- Script `npm run backfill:lojas` — cria loja padrão por empresa e vincula órfãos
  (usar apenas em bases que já tinham dados antes do nível 'loja').
- Script `npm run backfill:km` — recalcula distancia_km (trata NULL/0/NaN).
