# ── Étape 1 : build React ────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les manifestes en premier pour profiter du cache Docker
COPY package.json package-lock.json ./
RUN npm ci --production=false

COPY . .
RUN npm run build

# ── Étape 2 : serve avec nginx ────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Supprimer la config par défaut
RUN rm /etc/nginx/conf.d/default.conf

# Copier notre config nginx (proxy /api, gzip, cache, SPA fallback)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier le build React
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]