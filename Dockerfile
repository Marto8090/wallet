FROM node:22-bookworm-slim AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

FROM base AS test

ENV NODE_ENV=test

CMD ["npm", "test"]

FROM base AS production

RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

USER node

CMD ["npm", "start"]
