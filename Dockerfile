FROM osixia/openldap:1.5.0

EXPOSE 389

ADD ldif /container/service/slapd/assets/config/bootstrap/ldif
ADD templates /container/templates
ADD modify.ldif /container/modify.ldif

ENV LDAP_TLS="false"
ENV LDAP_BASE_DN=""
ENV LDAP_READONLY_USER="false"
ENV LDAP_RFC2307BIS_SCHEMA="false"
ENV LDAP_BACKEND="mdb"
ENV LDAP_REPLICATION="false"
ENV KEEP_EXISTING_CONFIG="false"
ENV LDAP_REMOVE_CONFIG_AFTER_SETUP="true"
ENV LDAP_SSL_HELPER_PREFIX="ldap"

ENV NVM_DIR=/usr/local/nvm
ENV NODE_VERSION=22

ADD start /container/start

ENTRYPOINT ["/container/start"]
