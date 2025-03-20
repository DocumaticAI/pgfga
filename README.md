# pgFGA

pgFGA is a pure-Postgres implementation of parts of [OpenFGA](https://openfga.dev/).

Read more about pgFGA in the [blog post](#TODO).

## Requirements

The only thing you need to use pgFGA is a PostgreSQL database, though the
convenience scripts in this repo also require:

- [The OpenFGA CLI](https://github.com/openfga/cli?tab=readme-ov-file#installation)

## Getting set up

The [`pgfga`](./pgfga) directory contains all the source code you need to add
pgFGA to your PostgreSQL database.

- `authz_model.sql` contains the DDL for defining the `authz_model` table. This
  holds your authorization model schema, and is versioned using the
  `schema_version` column.
- `check_permission.sql` contains the three PL/pgSQL functions you can use to
  check user permissions. These will be described in more detail below.
- `authz_relationship_example.sql` contains an example of how you might define
  the `authz_relationship` view to map data in your database to your
  authorization model.

Simply run these in your DB and you'll be good to go!

### Convenience scripts

The [`scripts`](./scripts) directory contains a few scripts that can help you
get started with pgFGA. These are run using the Bun JavaScript runtime, and use
Drizzle ORM to interact with the database. So far, they've been copied wholesale
from our internal monorepo, and no effort has been made to generalise them.

Regardless, the scripts are:

- `new.ts` - copies the latest schema from [`schemas`](./schemas) into a new
  `schemas/wip` directory. A schema has been provided in
  [`schemas/v000/schema.fga`](./schemas/v000/schema.fga) as an example.
- `finalize.ts` - changes the WIP schema to a finalized schema, and gives it a
  version number.
- `migrate.ts` - migrates the database to the latest schema version. If not
  running locally, will ignore any WIP schemas.
- `validate-all.ts` - uses the OpenFGA CLI to validate all schemas in the
  `schemas` directory.

Feel free to adapt the scripts to your needs.

## `check_permission`

The [`check_permission.sql`](./pgfga/check_permission.sql) file contains three
PL/pgSQL functions you can use to check user permissions.

You'll mostly be interacting with two of them:

```sql
check_permission(
    p_schema_version bigint,
    p_user_type text,
    p_user_id text,
    p_relation text,
    p_object_type text,
    p_object_id text
) returns boolean;

check_permission(
    p_user_type text,
    p_user_id text,
    p_relation text,
    p_object_type text,
    p_object_id text
)
returns boolean;
```

The former takes a schema version as its first argument, while the latter
function will use the latest schema version, which is useful for local
development. We recommend keeping your schema version in an environment variable
or a configuration file.
