# --- Étape 1 : build ---
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# --- Étape 2 : serve avec nginx ---
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Config nginx : redirige tout vers index.html pour le routing React
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' \
    > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]