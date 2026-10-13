FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
RUN npm install --workspace=@lotto/server
COPY shared ./shared
COPY server ./server
WORKDIR /app/server
RUN npm run build
EXPOSE 3001
CMD ["node", "dist/index.js"]
