FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY src ./src

RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Run as the unprivileged `node` user shipped with the base image (uid 1000)
# rather than root — limits blast radius if the process is compromised.
USER node

# Streamable HTTP transport port (only used when MCP_TRANSPORT=http).
# Stdio transport (the default) ignores this. When running HTTP in a container,
# also set MCP_HTTP_HOST=0.0.0.0 and publish the port (-p 3000:3000).
EXPOSE 3000

CMD ["node", "dist/server.js"]
