# Build from the repo root: docker build -f server/Dockerfile .
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server --include-workspace-root=false
COPY shared shared
COPY server server
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/src/main.ts"]
