FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY web/package.json ./web/
RUN npm ci --workspace=@lotto/shared --workspace=@lotto/web
COPY shared ./shared
RUN npm run build --workspace=@lotto/shared
COPY web ./web
RUN npm run build --workspace=@lotto/web

FROM nginx:alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY web/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["/usr/local/bin/docker-entrypoint.sh"]
