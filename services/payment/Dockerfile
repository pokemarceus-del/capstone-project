FROM node:20-alpine
WORKDIR /app/services/payment
COPY tsconfig.base.json /app/tsconfig.base.json
COPY services/payment/package.json ./package.json
COPY services/payment/tsconfig.json ./tsconfig.json
COPY services/payment/src ./src
RUN npm install \
    && npm run build \
    && npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3005
USER node
CMD ["npm", "run", "start"]
