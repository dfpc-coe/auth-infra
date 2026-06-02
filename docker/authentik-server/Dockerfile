FROM ghcr.io/goauthentik/server:2026.5.2

LABEL org.opencontainers.image.source=https://github.com/dfpc-coe/auth-infra
LABEL org.opencontainers.image.description="Authentik server for TAK server auth via LDAP"
LABEL org.opencontainers.image.licenses=MIT

COPY --chown=authentik:authentik user_settings.py /data/user_settings.py
