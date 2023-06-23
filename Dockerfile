FROM osixia/openldap

ENV LDAP_ORGANISATION="COTAK"
ENV LDAP_DOMAIN="cotak.gov"
ENV LOG_LEVEL="debug"
ENV LDAP_LOG_LEVEL="256"
ENV LDAP_BASE_DN=""
ENV LDAP_READONLY_USER="false"
ENV LDAP_RFC2307BIS_SCHEMA: "false"
ENV LDAP_BACKEND: "mdb"
ENV LDAP_TLS: "true"
ENV LDAP_TLS_CRT_FILENAME: "ldap.crt"
ENV LDAP_TLS_KEY_FILENAME: "ldap.key"
ENV LDAP_TLS_DH_PARAM_FILENAME: "dhparam.pem"
ENV LDAP_TLS_CA_CRT_FILENAME: "ca.crt"
ENV LDAP_TLS_ENFORCE: "false"
ENV LDAP_TLS_CIPHER_SUITE: "SECURE256:-VERS-SSL3.0"
ENV LDAP_TLS_VERIFY_CLIENT: "try"
ENV LDAP_REPLICATION: "false"
ENV KEEP_EXISTING_CONFIG: "false"
ENV LDAP_REMOVE_CONFIG_AFTER_SETUP: "true"
ENV LDAP_SSL_HELPER_PREFIX: "ldap"

ADD ldif /container/service/slapd/assets/config/bootstrap/ldif
COPY bootstrap.ldif /container/service/slapd/assets/config/bootstrap/ldif/50-bootstrap.ldif
