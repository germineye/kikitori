FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
RUN corepack pnpm install
COPY . .
RUN corepack pnpm build
ENV HOST=0.0.0.0 PORT=8787 NODE_ENV=production
EXPOSE 8787
USER node
CMD ["node", "server/index.mjs"]
