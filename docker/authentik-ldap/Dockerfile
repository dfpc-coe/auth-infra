# syntax=docker/dockerfile:1

# Interim image: authentik 2026.8.1 LDAP outpost with the memory-searcher
# fix (upstream PR pending; see docs in frontend-cotak
# docs/ai-reviews/2026-09-08-authentik-ldap-outpost-memory.md). The
# builder compiles the outpost binary from the release tag plus the one
# patch commit, using the same toolchain image and flags as upstream's
# lifecycle/container/ldap.Dockerfile at that tag; the runtime stage is
# the unmodified official image with only /ldap replaced. Revert to a
# plain FROM ghcr.io/goauthentik/ldap:<version> once a release carries
# the fix.

# lab/2026.8.1-snapshot = version/2026.8.1 + the memory searcher fix
ARG AUTHENTIK_REF=54d9be73ecbc64d51e41a76dbb2830059822bc02

FROM docker.io/library/golang:1.27-trixie@sha256:6212da3924947f4b6a939df02ea627c13f338f1a41d6c3fcb0dd9d076eef46c4 AS builder

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

FROM ghcr.io/goauthentik/ldap:2026.8.1

LABEL org.opencontainers.image.source=https://github.com/dfpc-coe/auth-infra
LABEL org.opencontainers.image.description="Authentik server for TAK server auth via LDAP"
LABEL org.opencontainers.image.licenses=MIT

# stamp the patched build into the outpost's version string / user agent
ARG AUTHENTIK_REF
ENV GIT_BUILD_HASH=${AUTHENTIK_REF}

COPY --from=builder /go/ldap /ldap
