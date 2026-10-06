FROM node:20-alpine
WORKDIR /app/services/notification
COPY tsconfig.base.json /app/tsconfig.base.json
COPY services/notification/package.json ./package.json
COPY services/notification/tsconfig.json ./tsconfig.json
COPY services/notification/src ./src
RUN npm install \
    && npm run build \
    && npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3006
USER node
CMD ["npm", "run", "start"]
