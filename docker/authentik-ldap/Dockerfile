# syntax=docker/dockerfile:1

# Interim image: authentik 2026.8.6 LDAP outpost with three fixes that no
# 2026.8.x release carries:
#   - the memory-searcher DN index (upstream PR #27120, open; lab record in
#     frontend-cotak docs/scratches/outpost-lab/dn-index-lab-2026-10-16.md)
#   - the cached binder applying provider changes on refresh (upstream PR
#     #27402, merged to main 2026-11-02, not backported to 2026.8)
#   - the session binder caching successful binds only (the one-condition
#     change from upstream PR #24582, open; a refused bind used to be cached
#     until the outpost restarted)
# The builder compiles the outpost binary from the release tag plus the three
# patch commits, using the same toolchain image and flags as upstream's
# lifecycle/container/ldap.Dockerfile at that tag; the runtime stage is the
# unmodified official image with only /ldap replaced. Revert to a plain
# FROM ghcr.io/goauthentik/ldap:<version> once a release carries all three.

# lab/2026.8.6-dn-index-session-binder = version/2026.8.6 + the DN-index
# commit + the session-binder commit + the successful-binds-only commit
ARG AUTHENTIK_REF=f3b97074b7ef9dafb620a128031ceba116ff9a13

FROM docker.io/library/golang:1.27-trixie@sha256:1896654cfc5c2b5ad74c07f29cb36f5d2d1cbed42e3054070fbfe444e521e83c AS builder

ARG AUTHENTIK_REPO=https://github.com/dfpc-coe/authentik.git
ARG AUTHENTIK_REF

WORKDIR /go/src/goauthentik.io

RUN git init -q . \
    && git fetch -q --depth 1 "${AUTHENTIK_REPO}" "${AUTHENTIK_REF}" \
    && git checkout -q FETCH_HEAD

RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=1 GOFIPS140=latest \
    go build -o /go/ldap ./cmd/ldap

FROM ghcr.io/goauthentik/ldap:2026.8.6

LABEL org.opencontainers.image.source=https://github.com/dfpc-coe/auth-infra
LABEL org.opencontainers.image.description="Authentik server for TAK server auth via LDAP"
LABEL org.opencontainers.image.licenses=MIT

# stamp the patched build into the outpost's version string / user agent
ARG AUTHENTIK_REF
ENV GIT_BUILD_HASH=${AUTHENTIK_REF}

COPY --from=builder /go/ldap /ldap
