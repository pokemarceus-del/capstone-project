FROM node:20-alpine AS build
WORKDIR /app/services/auth
RUN apk add --no-cache python3 make g++
COPY packages/authentication /app/packages/authentication
COPY tsconfig.base.json /app/tsconfig.base.json
COPY services/auth/package.json ./package.json
COPY services/auth/tsconfig.json ./tsconfig.json
COPY services/auth/src ./src
COPY services/auth/prisma ./prisma
RUN npm install \
    && npm run prisma:generate \
    && npm run build \
    && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app/services/auth
RUN apk add --no-cache libstdc++
COPY --from=build /app/packages/authentication /app/packages/authentication
COPY --from=build /app/services/auth/package.json ./package.json
COPY --from=build /app/services/auth/node_modules ./node_modules
COPY --from=build /app/services/auth/dist ./dist
COPY --from=build /app/services/auth/generated ./generated
COPY --from=build /app/services/auth/prisma ./prisma
ENV NODE_ENV=production
EXPOSE 3002
USER node
CMD ["npm", "run", "start"]
