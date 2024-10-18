FROM osixia/openldap

ADD ldif /container/service/slapd/assets/config/bootstrap/ldif

ENV LDAP_BASE_DN=""
ENV LDAP_READONLY_USER="false"
ENV LDAP_RFC2307BIS_SCHEMA="false"
ENV LDAP_BACKEND="mdb"
ENV LDAP_REPLICATION="false"
ENV KEEP_EXISTING_CONFIG="false"
ENV LDAP_REMOVE_CONFIG_AFTER_SETUP="true"
ENV LDAP_SSL_HELPER_PREFIX="ldap"
