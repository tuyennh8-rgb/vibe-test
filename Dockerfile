FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /srv

# Chỉ chép những gì game cần để chạy; file khác bị loại bởi .dockerignore.
COPY --chown=node:node server.js ./
COPY --chown=node:node app ./app
COPY --chown=node:node design ./design

# Không chạy bằng root.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server.js"]
