FROM node:20-alpine
WORKDIR /app/services/billing
COPY tsconfig.base.json /app/tsconfig.base.json
COPY services/billing/package.json ./package.json
COPY services/billing/tsconfig.json ./tsconfig.json
COPY services/billing/src ./src
RUN npm install \
    && npm run build \
    && npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3004
USER node
CMD ["npm", "run", "start"]
