# LGPD — dados pessoais no Logix

> Mapa do que é tratado, base legal, retenção e como atender titulares. Para anexar ao contrato
> com clientes (controladores) — o Logix atua como **operador** dos dados das lojas e como
> **controlador** dos dados de conta dos usuários do painel.

## Papéis
- **Controlador**: a empresa cliente (central de entregas) — decide finalidade e coleta dados de
  motoboys e destinatários.
- **Operador**: Logix — trata os dados conforme instruções do cliente, na plataforma.
- Cada empresa (tenant) só acessa os próprios dados: isolamento por `empresa_id` em toda tabela +
  Row-Level Security no banco (segunda trava) + testes automáticos de isolamento a cada deploy.

## Inventário
| Dado | Titular | Onde | Base legal | Retenção |
|---|---|---|---|---|
| Nome, e-mail, hash de senha (bcrypt) de usuários do painel | Funcionário do cliente | `usuarios` | Execução de contrato | Enquanto a conta existir; remoção em até 30 dias após pedido |
| Nome, CPF, telefone, CNH, documentos (fotos/PDF), selfie, PIX | Motoboy | `motoboys`, `motoboy_documentos`, storage R2 (URL assinada, chave por empresa) | Execução de contrato / obrigação legal (fiscal) | Vínculo ativo + 5 anos (fiscal) para dados financeiros; documentos removidos ao desligar |
| **Localização GPS** (lat/lng, horário) | Motoboy | `rastreamento` (histórico, particionado por dia), `motoboy_posicao_atual` | Execução de contrato; o motoboy é informado e liga/desliga o rastreamento no app | **Histórico: 30 dias** (`RASTREAMENTO_RETENCAO_DIAS`, DROP automático da partição). Posição atual: sobrescrita a cada ping |
| Nome, endereço, telefone do destinatário; nome do recebedor | Cliente final | `entregas_pontos`, `protocolos` | Execução de contrato (entrega) | Vida útil da corrida + prazo contratual com o cliente (padrão 12 meses) |
| Fotos de protocolo (comprovante de entrega) | Recebedor / ambiente | storage R2 (chave em `protocolos`) | Legítimo interesse (prova de entrega) | Igual à corrida |
| Mensagens de chat motoboy↔central/loja | Motoboy, atendente | `chat_mensagens`, mídia no R2 | Execução de contrato | 12 meses |
| Logs de acesso (IP, rota, `reqId`, `usuarioId`) | Usuários | Railway logs, Sentry | Legítimo interesse (segurança) | 30 dias (retenção do provedor) |
| Auditoria (quem fez o quê) | Usuários do painel | `auditoria` | Obrigação legal / legítimo interesse | 5 anos |

## Medidas técnicas
- Transporte: TLS em toda ponta (Railway, Vercel, Cloudflare). Banco com TLS e verificação de certificado.
- Repouso: criptografia do provedor (Postgres gerenciado, R2). Senhas com bcrypt (custo 12); tokens de refresh só como hash.
- Acesso: JWT curto (15 min) + refresh rotativo; perfis (super_admin / central_admin / loja / motoboy); permissões por módulo e papel; impersonação auditada.
- Arquivos: nunca públicos — URL assinada com expiração (1 h leitura; 10 min upload); chave inclui a empresa e é validada no servidor.
- Minimização: fotos redimensionadas no cliente; GPS com precisão de ~1 m mas retenção curta; painel não vê CPF completo onde não precisa.
- Isolamento: `empresa_id` + RLS + testes de integração (tenant B não lê A nem por id, nem por header, nem por SQL sem WHERE).
- Rastreabilidade: `reqId` em toda resposta, logs estruturados, Sentry, `auditoria`.

## Direitos dos titulares (como atender)
| Pedido | Procedimento |
|---|---|
| Acesso / portabilidade (motoboy) | Exportar `motoboys`, `motoboy_documentos`, corridas e financeiro por `motoboy_id` (script sob demanda). |
| Correção | Painel → cadastro do motoboy / usuário. |
| Exclusão (motoboy desligado) | Desativar → após prazo fiscal, `DELETE` em cascata (`ON DELETE CASCADE` em documentos, tokens, posição, GPS) + remoção das chaves no R2 pelo prefixo `empresas/<id>/…`. Dados financeiros retidos pelo prazo legal, anonimizados quando possível. |
| Oposição ao rastreamento | O motoboy desliga "online" no app; sem GPS não recebe corridas (regra de negócio informada no cadastro). |
| Incidente de segurança | Runbook em `DR-CONTINUIDADE.md`; comunicação à ANPD e aos titulares em prazo razoável (LGPD art. 48), com apoio do cliente controlador. |

## Terceiros (suboperadores)
Railway (API/worker/Postgres, EUA), Neon (Postgres, se usado), Cloudflare (R2, DNS), Vercel (painel), OpenRouteService/heigit (rotas — só coordenadas), Google Maps (tiles/geocoding), Expo (push — token de dispositivo), Sentry (erros — pode conter `usuarioId`; PII de payload é redigida pelo logger). Transferência internacional: cláusulas padrão dos provedores.

## Pendências
- [ ] Preencher DPO/encarregado e canal de contato para titulares.
- [ ] Script de exportação/exclusão por titular (`scripts/titular-exportar.js`, `titular-excluir.js`).
- [ ] Política de retenção configurável por empresa para corridas/chat (hoje: padrão).
