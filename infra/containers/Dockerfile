FROM node:24.13.0-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:24.13.0-bookworm-slim
ARG COMRADE_COMMIT=development
ENV NODE_ENV=production PORT=3001 COMRADE_COMMIT=${COMRADE_COMMIT}
WORKDIR /app
COPY --from=build /app/apps/web/dist ./public
COPY --from=build /app/apps/service/dist ./apps/service/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/service/node_modules ./apps/service/node_modules
COPY --from=build /app/apps/service/package.json ./apps/service/package.json
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/packages/fusion ./packages/fusion
# Fingerprint the compiled JavaScript that the persistent region actually runs.
RUN bash -o pipefail -ec 'find packages/fusion/dist packages/contracts/dist -type f -name "*.js" -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -d" " -f1 > /app/.comrade-engine-artifact.sha256'
ENV COMRADE_ENGINE_ARTIFACT_PATH=/app/.comrade-engine-artifact.sha256
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/service/dist/index.js"]
