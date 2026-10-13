#!/bin/sh
# Web entrypoint: inject the API upstream into nginx.conf, then run nginx.
# SERVER_UPSTREAM must be set (docker-compose.yml sets it for local Docker;
# on Railway it is the server service's private domain + port).
set -eu
: "${SERVER_UPSTREAM:?SERVER_UPSTREAM must be set (e.g. http://server:3001)}"
envsubst '$SERVER_UPSTREAM' < /etc/nginx/conf.d/default.conf > /tmp/default.conf
cat /tmp/default.conf > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
