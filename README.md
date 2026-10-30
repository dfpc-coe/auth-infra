<h1 align=center>TAK Auth Infra</h1>

<p align=center>Infrastructure to support LDAP based auth in TAK via <a href="https://goauthentik.io/">Authentik</a></p>

## AWS Deployment

### 1. Pre-Reqs

> [!IMPORTANT]
> The Auth-Infra service assumes some pre-requisite dependencies are deployed before
> initial deployment.

The following are dependencies which need to be created:

| Name                  | Notes |
| --------------------- | ----- |
| `tak-vpc-<name>`      | VPC & networking to place tasks in - [repo](https://github.com/dfpc-coe/vpc)      |

An AWS ACM certificate must also be generated that covers the subdomain that the Auth-Infra is deployed to.

### 2. Installing Dependencies

From the root directory, install the deploy dependencies

```sh
npm install
```

### 3. Authentik Server Deployment

Deployment to AWS is handled via AWS Cloudformation. The template can be found in the `./cloudformation`
directory. The deployment itself is performed by [Deploy](https://github.com/openaddresses/deploy) which
was installed in the previous step.

> [!NOTE]
> The deploy tool can be run via the following
>
> ```sh
> npx deploy
> ```
>
> To install it globally - view the deploy [README](https://github.com/openaddresses/deploy)
>
> Deploy uses your existing AWS credentials. Ensure that your `~/.aws/credentials` has an entry like:
>
> ```
> [coe]
> aws_access_key_id = <redacted>
> aws_secret_access_key = <redacted>
> ```

Deployment can then be performed via the following:

```
npx deploy create <stack>
npx deploy update <stack>
npx deploy info <stack> --outputs
npx deploy info <stack> --parameters
```

Stacks can be created, deleted, cancelled, etc all via the deploy tool. For further information
information about `deploy` functionality run the following for help.

```sh
npx deploy
```

#### Sub-Stack Deployment

The CloudFormation is split into two stacks to ensure consistent deploy results.

The first portion deploys the Authentik Server itself. The second portion deploys the Authentik LDAP Outpost.

Step 1: Create the Authenik Server Portion

```
npx deploy create <stack>
```

The custom Authentik server image in this repository bakes in
[docker/authentik-server/user_settings.py](docker/authentik-server/user_settings.py), which is copied to
`/data/user_settings.py` inside the container. Authentik loads that file automatically on startup for both the
server and worker processes. It is currently used to enable Django BCrypt password hashers for imported legacy
passwords.

#### Media Storage

Authentik media is stored in S3 per the [S3 storage guide](https://docs.goauthentik.io/sys-mgmt/ops/storage-s3/).
The server stack creates a `<stack>-<region>-media` bucket, KMS encrypted with all public access blocked, and a
CORS rule allowing `GET` from `https://auth.<hosted-zone-name>`.

`AUTHENTIK_STORAGE__BACKEND`, `AUTHENTIK_STORAGE__S3__REGION` and `AUTHENTIK_STORAGE__S3__BUCKET_NAME` are set on
the server and worker containers. There is no access key - the ECS task role carries the bucket permissions.

The bucket is retained on stack delete.

The Authentik server ECS service now always uses target-tracking autoscaling. CPU utilization is hardcoded to a
60% target and memory utilization is hardcoded to a 75% target. The CloudFormation parameters
`ServerAutoScalingMinCapacity` and `ServerAutoScalingMaxCapacity` can be used to bound cost.

Step 2: Configure the Authentik LDAP Provider

The bind flow, service account, provider, application and outpost record are defined in
[blueprints/ldap.blueprint.yaml](blueprints/ldap.blueprint.yaml), so a new deployment is configured by applying
that file rather than by following the Authentik [LDAP provider guide](https://docs.goauthentik.io/docs/add-secure-apps/providers/ldap/generic_setup)
by hand. In the admin UI at `https://auth.<hosted-zone-name>`:

1. **Apply the blueprint:** Customisation > Blueprints > Create. Name it `tak-ldap`, choose the Internal tab and paste
   the file as the content, and under Additional settings set Context to

   ```
   {"authentik_host": "https://auth.<hosted-zone-name>"}
   ```

   Save, then Apply from the row's actions. A green status means every object landed; a red one carries the error.
   Objects are matched on name or slug, so re-applying the file updates them in place.

2. **LDAP Service Account:** the blueprint creates the `ldapsvcaccount` user with no password. Set it from
   Directory > Users > ldapsvcaccount > Set password, using the `password` value of the `<stack>/svc` secret
   that the above CloudFormation template generated (its `username` is `ldapsvcaccount`). TAK binds as
   `cn=ldapsvcaccount,ou=users,dc=ldap,dc=goauthentik,dc=io` with that password.

3. **LDAP Outpost AUTHENTIK_TOKEN:** the blueprint creates the `LDAP Outpost` record, and with it the outpost's
   token. Read it from Applications > Outposts > LDAP Outpost > View deployment info, and save it as the whole
   plain value of the `<stack>/authentik-ldap-token` secret (the outpost task reads the entire secret into
   `AUTHENTIK_TOKEN`, not a JSON key).

> [!WARNING]
> The LDAP outpost's bind flow is the provider's **Authorization flow** (the "Bind Flow" field on the LDAP provider
> form writes that column). A provider whose authorization flow needs an already-authenticated user refuses every
> bind with code 49 and logs "Flow does not apply to current user" in the outpost's CloudWatch log group. And on a
> provider in cached bind mode a bind-flow change does not reach a running outpost (Authentik 2026.8.4): the
> outpost keeps the old flow, and its cache of refused binds, until its tasks are replaced. After changing the
> bind flow, force a new deployment of the LDAP stack's `-LDAP-Outpost` ECS service.

> [!NOTE]
> The blueprint is written for a new deployment and has code-based MFA support off. COTAK production was
> configured by hand before the file existed and has MFA support on; review the differences before applying the
> file there.

Step 3: Create the Authentik LDAP Outpost

```
npx deploy create <stack> --template ./cloudformation/ldap.template.js
```

Step 4: Verify the LDAP DNS record

The LDAP stack now creates an `ldap.<hosted-zone-name>` Route53 alias automatically and points it at the internal NLB. For example, if the hosted zone is `epatak.org`, the stack will create `ldap.epatak.org`.

The LDAP outpost is exposed as LDAPS only on port `636`. The LDAP CloudFormation template automatically associates the VPC ACM certificate with the secure listener.

TLS terminates on the NLB at port `636` and the decrypted LDAP traffic is forwarded internally to the outpost on port `3389`.

```
ldapsearch -x -H ldaps://ldap.<domain>:636 -D "cn=akadmin,ou=users,dc=ldap,dc=goauthentik,dc=io" -W -b "ou=users,dc=ldap,dc=goauthentik,dc=io" -s sub "(objectClass=person)" dn cn uid mail
```

### Bind Examples

```
ldapsearch -x -H ldaps://ldap.<domain>:636 -D "cn=<username>,ou=users,dc=ldap,dc=goauthentik,dc=io" -W -b "ou=users,dc=ldap,dc=goauthentik,dc=io" -s sub "(objectClass=person)" dn cn uid mail
```

```
ldapsearch -x -H ldaps://ldap.cotak.gov:636   -D "cn=nicholas.ingalls@state.co.us,ou=users,dc=ldap,dc=goauthentik,dc=io" -W   -b "ou=groups,dc=ldap,dc=goauthentik,dc=io"   -s sub "(member=cn=nicholas.ingalls@state.co.us,ou=users,dc=ldap,dc=goauthentik,dc=io)" dn cn description
```
