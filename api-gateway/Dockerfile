FROM nginx:1.25.3-alpine

# Fix permissions for nginx
RUN mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp /var/cache/nginx/fastcgi_temp /var/cache/nginx/uwsgi_temp /var/cache/nginx/scgi_temp /var/run && \
    chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d /usr/share/nginx/html /var/run && \
    chmod -R 755 /var/cache/nginx /var/run

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create a simple health check endpoint
RUN echo "healthy" > /usr/share/nginx/html/health.html && \
    chown nginx:nginx /usr/share/nginx/html/health.html

# Use root user to avoid permission issues, then switch to nginx
USER root

# Create entrypoint script to fix permissions and start nginx
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo 'chown -R nginx:nginx /var/run /var/cache/nginx /var/log/nginx' >> /docker-entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]