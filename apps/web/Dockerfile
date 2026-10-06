FROM node:20-alpine AS base
WORKDIR /app/apps/web

COPY tsconfig.base.json /app/tsconfig.base.json
COPY apps/web/package.json ./package.json
RUN npm install

COPY apps/web/ ./
RUN npm run build \
    && npm prune --omit=dev \
    && chown -R node:node /app

ENV NODE_ENV=production

EXPOSE 3000
USER node
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
