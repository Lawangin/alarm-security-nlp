# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

COPY . .

RUN pnpm build

# Stage 2: Serve with nginx
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html

# nginx config to support SPA routing
RUN echo 'server { \
  listen 3000; \
  root /usr/share/nginx/html; \
  index index.html; \
  location / { \
    try_files $uri $uri/ /index.html; \
  } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
