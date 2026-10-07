FROM node:20-alpine
WORKDIR /app/services/customer
COPY packages/authentication /app/packages/authentication
COPY tsconfig.base.json /app/tsconfig.base.json
COPY services/customer/package.json ./package.json
COPY services/customer/tsconfig.json ./tsconfig.json
COPY services/customer/src ./src
COPY services/customer/prisma ./prisma
COPY services/customer/openapi.json ./
RUN npm install \
    && npx prisma generate --schema prisma/schema.prisma \
    && npm run build \
    && npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3001
USER node
CMD ["npm", "run", "start"]
