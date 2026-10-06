FROM node:20-alpine
WORKDIR /app/services/reading
COPY tsconfig.base.json /app/tsconfig.base.json
COPY services/reading/package.json ./package.json
COPY services/reading/tsconfig.json ./tsconfig.json
COPY services/reading/src ./src
RUN npm install \
    && npm run build \
    && npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3003
USER node
CMD ["npm", "run", "start"]
