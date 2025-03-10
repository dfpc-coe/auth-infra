FROM bitnami/openldap:2.6.8

EXPOSE 389

ENV LDAP_LOGLEVEL=256
ENV LDAP_ENABLE_TLS=no
ENV LDAP_USER_DC='People'
ENV LDAP_GROUP='Group'
ENV LDAP_ALLOW_ANON_BINDING=no

ENV NVM_DIR=/usr/local/nvm
ENV NODE_VERSION=22

COPY ldif/overlays.ldif /schemas/
