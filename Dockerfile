# 尘世浮生 · Docker 版
# 阶段 1 构建前端(Vite)，阶段 2 用无依赖的 Node lite-server 托管 + 提供
# chat 流式 / 生图代理最小后端。镜像不含 Rust/Tauri，构建快、体积小。
#
#   docker compose up -d --build
#   浏览器打开 http://localhost:8080  （设了口令则 ?token=xxx）

# ── 阶段 1：构建前端 ─────────────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json ./
COPY src ./src
COPY public ./public
# 可选：构建期注入默认生图 key（任何进前端产物的 key 都可被提取，
# 更推荐留空、改用运行时 IMAGE_API_KEY 走服务端代理注入）
ARG VITE_STEPFUN_API_KEY=
ENV VITE_STEPFUN_API_KEY=${VITE_STEPFUN_API_KEY}
# 只跑 vite 打包；vue-tsc 类型检查在 CI / 桌面构建里做
RUN npx vite build

# ── 阶段 2：运行时 ───────────────────────────────────────────
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY docker/server/package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY docker/server/lite-server.mjs ./
COPY --from=web /build/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "lite-server.mjs"]
