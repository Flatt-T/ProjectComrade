FROM node:24.13.0-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:24.13.0-bookworm-slim
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=build /app/apps/web/dist ./public
COPY --from=build /app/apps/service/dist ./apps/service/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/service/node_modules ./apps/service/node_modules
COPY --from=build /app/apps/service/package.json ./apps/service/package.json
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/service/dist/index.js"]
