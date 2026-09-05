FROM node:22-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# Dependências primeiro (cache de camada) — npm ci é reprodutível, npm install não.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Nunca rodar como root dentro do container.
RUN chown -R node:node /app
USER node

EXPOSE 3000
# Healthcheck do próprio container (Railway usa o dele, mas Docker/Compose/K8s usam este).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
