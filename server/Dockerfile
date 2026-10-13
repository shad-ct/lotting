FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
RUN npm ci --workspace=@lotto/shared --workspace=@lotto/server
COPY shared ./shared
RUN npm run build --workspace=@lotto/shared
COPY server ./server
RUN npm run build --workspace=@lotto/server
EXPOSE 3001
CMD ["node", "server/dist/index.js"]
