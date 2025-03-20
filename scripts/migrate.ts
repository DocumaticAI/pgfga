/**
 * Migrate will add the latest model to the database if required.
 * In local development, this will include WIP schemas, and these will ALWAYS
 * be registered, overriding the latest version in the database.
 */

import * as path from "node:path";
import { parseArgs } from "node:util";
import { schema } from "@arda/db";
import { eq, max } from "drizzle-orm";
import { getSchemaFromFile, validateSchema } from "../src/fga-cli";
import { getDb, getLatestSchemaVersion } from "../src/script-utils";
import { generateAuthzModel } from "../src/transform";

async function fetchAuthzModel(
  schemaVersionToCreate: number,
  schemaDirName: string,
): Promise<schema.DbAuthzModelInsert[]> {
  // Validate path exists
  const schemaPath = path.join(
    process.cwd(),
    "schemas",
    schemaDirName,
    "schema.fga",
  );
  console.log(`Validating schema at ${schemaPath}`);

  const exists = await Bun.file(schemaPath).exists();
  if (!exists) {
    console.error(`Schema at ${schemaPath} does not exist`);
    process.exit(1);
  }

  // Ensure schema is valid
  if (!(await validateSchema(schemaPath))) {
    console.error(`Schema at ${schemaPath} is not valid`);
  }

  const schemaResult = await getSchemaFromFile(schemaPath);
  if (!schemaResult.ok) {
    console.error(
      `Failed to parse schema at ${schemaPath}: ${schemaResult.error}`,
    );
    process.exit(1);
  }
  const fgaSchema = schemaResult.data;

  const authzModelResult = generateAuthzModel(schemaVersionToCreate, fgaSchema);
  if (!authzModelResult.ok) {
    console.error(`Failed to generate authz model: ${authzModelResult.error}`);
    process.exit(1);
  }

  if (authzModelResult.data.length === 0) {
    console.error("No authz model generated");
    process.exit(1);
  }

  return authzModelResult.data;
}

async function localMigrate() {
  console.warn("Running local migration");
  const latestSchemaVersion = getLatestSchemaVersion();
  if (!latestSchemaVersion) {
    console.error("No latest schema version found");
    process.exit(1);
  }

  let schemaVersionToCreate: number;
  let schemaDirName: string;

  if (latestSchemaVersion.type === "numeric") {
    schemaVersionToCreate = latestSchemaVersion.number;
    schemaDirName = latestSchemaVersion.dirName;
  } else {
    const latestFinalizedSchemaVersion = getLatestSchemaVersion(true);
    if (!latestFinalizedSchemaVersion) {
      console.error("No latest finalized schema version found");
      process.exit(1);
    }
    if (latestFinalizedSchemaVersion.type !== "numeric") {
      console.error("Latest finalized schema version is not numeric");
      process.exit(1);
    }

    schemaVersionToCreate = latestFinalizedSchemaVersion.number + 1;
    schemaDirName = "wip";
  }

  const authzModel = await fetchAuthzModel(
    schemaVersionToCreate,
    schemaDirName,
  );

  // Delete the schema version with the same number, then recreate it
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.authz_model)
      .where(eq(schema.authz_model.schema_version, schemaVersionToCreate));
    console.warn(`Deleted old schema version ${schemaVersionToCreate}`);
    await tx.insert(schema.authz_model).values(authzModel);
  });

  if (schemaDirName === "wip") {
    console.warn(`Inserted WIP schema version ${schemaVersionToCreate}`);
  } else {
    console.warn(`Inserted finalized schema version ${schemaVersionToCreate}`);
  }
}

/**
 * Check the latest version in the database, and only update if it's lower than the
 * latest schema version in the local directory.
 */
async function nonLocalMigrate() {
  console.warn("Running non-local migration");

  const db = getDb();
  const latestLocalSchemaVersion = getLatestSchemaVersion(true);
  if (!latestLocalSchemaVersion) {
    console.error("No latest local schema version found");
    process.exit(1);
  }
  if (latestLocalSchemaVersion.type !== "numeric") {
    console.error("Latest local schema version is not numeric");
    process.exit(1);
  }
  console.log(
    `Latest local schema version: ${latestLocalSchemaVersion.number}`,
  );

  const [latestDbSchemaVersion] = await db
    .select({ version: max(schema.authz_model.schema_version) })
    .from(schema.authz_model);

  console.log(
    `Latest schema version in the database: ${latestDbSchemaVersion?.version ?? "none"}`,
  );
  if (
    latestDbSchemaVersion?.version &&
    latestDbSchemaVersion.version >= latestLocalSchemaVersion.number
  ) {
    console.warn(
      `Latest schema version in the database is ${latestDbSchemaVersion.version}, no migration needed`,
    );
    return null;
  }

  console.log(
    `Fetching authz model for version ${latestLocalSchemaVersion.number} from ${latestLocalSchemaVersion.dirName}`,
  );
  const authzModel = await fetchAuthzModel(
    latestLocalSchemaVersion.number,
    latestLocalSchemaVersion.dirName,
  );

  // Create the new schema
  console.log(
    `Inserting new schema version ${latestLocalSchemaVersion.number}`,
  );
  await db.insert(schema.authz_model).values(authzModel);
  console.log(`Inserted new schema version ${latestLocalSchemaVersion.number}`);

  return latestLocalSchemaVersion;
}

async function main() {
  const local = !["dev", "stag", "prod"].includes(
    process.env.ENVIRONMENT ?? "local",
  );

  if (local) {
    await localMigrate();
    return;
  }

  // Only require flag if we're running in non-local
  const { values } = parseArgs({
    options: {
      env: {
        type: "string",
        multiple: false,
      },
    },
  });

  if (!values.env) {
    console.error("No environment specified");
    process.exit(1);
  }
  const env = values.env;

  const nonLocalMigrateResult = await nonLocalMigrate();
  if (nonLocalMigrateResult === null) {
    return;
  }

  // Update Doppler secret
  await Bun.$`doppler secrets set -p global-credentials -c ${env} AUTHZ_MODEL_VERSION="${nonLocalMigrateResult.number}"`;
}

await main();
process.exit(0);
