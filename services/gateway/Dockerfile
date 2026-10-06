FROM node:20-alpine
WORKDIR /app/services/gateway
COPY tsconfig.base.json /app/tsconfig.base.json
COPY services/gateway/package.json ./package.json
COPY services/gateway/tsconfig.json ./tsconfig.json
COPY services/gateway/src ./src
RUN npm install \
    && npm run build \
    && npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 8080
USER node
CMD ["npm", "run", "start"]
