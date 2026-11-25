FROM node:24-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY shared ./shared
COPY server ./server
COPY fixtures ./fixtures
RUN npm run build

ENV NODE_ENV=production
CMD ["node", "--import", "tsx", "server/index.ts", "--serve-built-app"]
