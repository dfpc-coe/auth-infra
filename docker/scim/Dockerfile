FROM public.ecr.aws/lambda/nodejs:24

LABEL org.opencontainers.image.source=https://github.com/dfpc-coe/auth-infra
LABEL org.opencontainers.image.description="SCIM bridge syncing Authentik groups to Slack channels"
LABEL org.opencontainers.image.licenses=MIT

COPY package*.json ${LAMBDA_TASK_ROOT}/

RUN npm install

COPY . ${LAMBDA_TASK_ROOT}/

RUN npm run build

CMD ["dist/index.handler"]
