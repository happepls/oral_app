FROM mongo:6.0 AS mongo-tools

FROM ubuntu:24.04

ARG COSCLI_VERSION=v1.0.8
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       ca-certificates cron curl gzip postgresql-client ripgrep tar tzdata \
    && rm -rf /var/lib/apt/lists/*
RUN COSCLI_ARCH="$(dpkg --print-architecture)" \
    && case "${COSCLI_ARCH}" in \
         amd64) COSCLI_SHA256="7165f2ae16c5f7ac495864c963ca574a76e04ec72680d7bc8a8eee3234d8cf91" ;; \
         arm64) COSCLI_SHA256="0404b4da5b1d0c230c7d7522cb3bbec2909e314ab998889a0aeb8dc6094a2d21" ;; \
         *) echo "Unsupported target architecture: ${COSCLI_ARCH}" >&2; exit 1 ;; \
       esac \
    && curl -fsSL --retry 3 --retry-all-errors --connect-timeout 20 --max-time 120 \
         "https://cosbrowser.cloud.tencent.com/software/coscli/coscli-linux-${COSCLI_ARCH}" \
         -o /usr/local/bin/coscli \
    && echo "${COSCLI_SHA256}  /usr/local/bin/coscli" | sha256sum -c - \
    && chmod 0755 /usr/local/bin/coscli \
    && /usr/local/bin/coscli --version | rg -q "${COSCLI_VERSION}"

COPY --from=mongo-tools /usr/bin/mongodump /usr/local/bin/mongodump
COPY --from=mongo-tools /usr/bin/mongorestore /usr/local/bin/mongorestore
COPY backup.sh run-with-alert.sh restore.sh health.sh cron-entrypoint.sh /opt/oral-backup/
COPY crontab /etc/cron.d/oral-backup
RUN chmod 0755 /opt/oral-backup/*.sh \
    && chmod 0644 /etc/cron.d/oral-backup \
    && crontab /etc/cron.d/oral-backup \
    && mkdir -p /var/lib/oral-backup

CMD ["/opt/oral-backup/cron-entrypoint.sh"]
