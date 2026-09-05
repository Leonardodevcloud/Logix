// Dados: ofertas 'ofertada' de entregas que já saíram da fila (entregues/canceladas/atribuídas).
// Achado pela tela Saúde do sistema (107 órfãs, a mais antiga com 31 dias). O cron passa a
// fazer isso a cada 5 min; esta migração corrige o passado.
exports.shorthands = undefined;
exports.up = (pgm) => {
  pgm.sql(`
    UPDATE entregas_ofertas o
       SET status = CASE WHEN e.status = 'cancelada' THEN 'cancelada' ELSE 'expirada' END
      FROM entregas e
     WHERE e.id = o.entrega_id AND o.status = 'ofertada'
       AND (e.status <> 'aguardando_atribuicao' OR e.motoboy_id IS NOT NULL OR o.expira_em < now())`);
};
exports.down = () => { /* correção de dados; sem volta */ };
