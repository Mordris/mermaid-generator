# Mermaid Studio — static site served by nginx.
FROM nginx:1.31-alpine

# Drop the default site config and use ours.
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/mermaid-studio.conf

# Copy the static assets.
COPY index.html styles.css app.js /usr/share/nginx/html/

# Container listens on 80 internally; the host port is mapped in compose.
EXPOSE 80

# Lightweight healthcheck.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:80/ || exit 1
