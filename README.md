<h1 align=center>TAK Auth Infra</h1>

<p align=center>Infrastructure to support LDAP based auth in TAK</p>

## AWS Deployment

### 1. Pre-Reqs

The Auth-Infra service assumes some pre-requisite dependencies are deployed before
initial deployment.
The following are dependencies which need to be created:

| Name                  | Notes |
| --------------------- | ----- |
| `tak-vpc-<name>`      | VPC & networking to place tasks in - [repo](https://github.com/dfpc-coe/vpc)      |
| `coe-ecr-auth`        | ECR Repository for storing Auth-Infra Images - [repo](https://github.com/dfpc-coe/ecr)   |

An AWS ACM certificate must also be generated that covers the subdomain that the Auth-Infra is deployed to.

### 2. Installing Dependencies

From the root directory, install the deploy dependencies

```sh
npm install
```

### 3. Building Docker Images & Pushing to ECR
You also need to make sure that [Docker](https://docs.docker.com/engine/install/) and [Docker Compose](https://docs.docker.com/compose/install/) are installed on your local machine. 

### 3. Prerequisites

The following environment variable need to be set: 
```
export AWS_REGION='us-east-1'
export AWS_ACCOUNT_ID='123456789012'
export Environment='prod'
```

### 4. Building Docker Images & Pushing to ECR

An script to build the docker image and publish it to your ECR is provided and can be run using:

```
npm run build
```

from the root of the project. Ensure that you have created the necessary ECR repositories as descrived in the
previos step and that you have AWS credentials provided in your current terminal environment as an `aws ecr get-login-password`
call will be issued.

### 5. Auth Deployment

Deployment to AWS is handled via AWS Cloudformation. The template can be found in the `./cloudformation`
directory. The deployment itself is performed by [Deploy](https://github.com/openaddresses/deploy) which
was installed in the previous step.

The deploy tool can be run via the following

```sh
npx deploy
```

To install it globally - view the deploy [README](https://github.com/openaddresses/deploy)

Deploy uses your existing AWS credentials. Ensure that your `~/.aws/credentials` has an entry like:

```
[coe]
aws_access_key_id = <redacted>
aws_secret_access_key = <redacted>
```

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

Further help about a specific command can be obtained via something like:

```sh
npx deploy info --help
```

### Example Local Testing

1. Create a .env.local file at the project root with the following contents:

```sh
LDAP_DOMAIN=cotak.gov
LDAP_ADMIN_PASSWORD=admin
LDAP_SVC_PASSWORD=service
LDAP_PORT=3389
FORCE_NEW_CONFIG=false
```

... adjusting the values as necessary.

The FORCE_NEW_CONFIG flag is used to delete all existing slapd configuration data and start from scratch.  We suggest
initially testing with the example.ldif in step 3, then create your real ldif file, set this flag to true and rebuild from step 2.

The LDAP_PORT is the external port exposed by the docker container that your TAK server will connect to.

2. Build the Docker Image

```sh
docker compose --env-file .env.local up -d --build
```

3. Populate the database with users

```sh
ldapadd -D 'cn=admin,dc=cotak,dc=gov' -H ldap://localhost:3389 -w admin -f example.diff
```

An example LDIF file for adding users and groups is provided in the example.ldif file.  You can use this for initial testing.

SSHA passwords can be generated using the following command:

```shell
slappasswd -h {SSHA} -s "your_password_here
```

4. Ensure the service account can list users

The service account is the read-only "bind" account that the TAK server uses to authenticate and enumerate users.

Replace your domain and password as appropriate:

```shell
ldapsearch -v -x -D 'uid=ldapsvcaccount,dc=cotak,dc=gov' -b 'dc=cotak,dc=gov' -H ldap://localhost:3389 -w service
```

This should return a comprehensive list of all the policies, groups and users.

5. Ensure the memberOf overlay is working

As an additional check, ensure that the memberOf overlay is working by searching for an individual user and checking that there are memberOf attributes included in the response, corresponding to the group(s) they belong to.

```shell
ldapsearch -v -x -D 'uid=ldapsvcaccount,dc=cotak,dc=gov' -b 'ou=People,dc=cotak,dc=gov' -H ldap://localhost:3389 -w service -x "uid=janedoe@example.org" +
```

6. Ensure the admin account can list users

The admin account is the fully privileged account that can add/remove users and groups, used by your provisioning software (not by the TAK server).

```shell
ldapsearch -v -x -D 'cn=admin,dc=cotak,dc=gov' -b 'dc=cotak,dc=gov' -H ldap://localhost:3389 -w admin
```
