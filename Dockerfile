FROM osixia/openldap

ENV LDAP_ORGANISATION="COTAK"
ENV LDAP_DOMAIN="cotak.gov"

ADD ldif /container/service/slapd/assets/config/bootstrap/ldif
COPY test.ldif /container/service/slapd/assets/config/bootstrap/ldif/50-bootstrap.ldif
