// Schemas zod compartilhados. Regra: toda rota nova nasce com schema.
// Rotas antigas migram conforme forem tocadas (prioridade: as que gravam dado).
const { z } = require('zod');

const texto = (max = 200) => z.string().trim().min(1).max(max);
const uuid = z.string().uuid();
const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
const email = z.string().trim().toLowerCase().email().max(160);

const schemas = {
  // Auth do painel
  login: z.object({
    email,
    senha: z.string().min(1, 'Senha obrigatória').max(200),
  }),

  // GPS do app do motoboy — 1 ponto
  posicao: z.object({
    lat, lng,
    entrega_id: uuid.nullable().optional(),
    precisao_m: z.coerce.number().min(0).max(10000).optional(),
    velocidade: z.coerce.number().min(0).max(300).optional(),
    capturado_em: z.coerce.date().optional(),
  }),

  // GPS em lote (preparação para o app enviar 3–4 pontos por request)
  posicoes: z.object({
    pontos: z.array(z.object({ lat, lng, entrega_id: uuid.nullable().optional(), capturado_em: z.coerce.date().optional() })).min(1).max(20),
  }),

  pushRegistrar: z.object({
    token: z.string().trim().regex(/^Expo(nent)?PushToken\[.+\]$/, 'Token Expo inválido'),
    plataforma: z.enum(['android', 'ios']).nullable().optional(),
  }),

  pushRemover: z.object({ token: z.string().trim().max(200).nullable().optional() }),

  paginacao: z.object({
    pagina: z.coerce.number().int().min(1).default(1),
    limite: z.coerce.number().int().min(1).max(200).default(50),
  }),
};

module.exports = { z, schemas, primitivas: { texto, uuid, lat, lng, email } };
