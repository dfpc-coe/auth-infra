FROM bitnami/openldap:2.6

COPY config/*.ldif /schemas/

EXPOSE 1389

