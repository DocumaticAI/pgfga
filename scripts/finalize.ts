import fs from "node:fs/promises";
import { getLatestSchemaVersion } from "../src/script-utils";

async function main() {
  const latestSchemaVersion = getLatestSchemaVersion();
  if (latestSchemaVersion === null) {
    console.error("No schemas found.");
    process.exit(1);
  }

  if (latestSchemaVersion.type !== "wip") {
    console.error(
      "There's no WIP schema to finalize. Run `bun new` to generate one.",
    );
    process.exit(1);
  }

  const currentSchemaVersion = getLatestSchemaVersion(true);
  if (currentSchemaVersion === null) {
    console.error("No current schema found.");
    process.exit(1);
  }
  if (currentSchemaVersion.type !== "numeric") {
    console.error("Current schema is not numeric.");
    process.exit(1);
  }

  const version = (currentSchemaVersion.number + 1).toString().padStart(3, "0");
  const newSchemaDir = `./schemas/v${version}`;
  await fs.mkdir(newSchemaDir, { recursive: true });

  for (const file of await fs.readdir("./schemas/wip")) {
    await fs.copyFile(`./schemas/wip/${file}`, `${newSchemaDir}/${file}`);
  }

  await fs.rmdir("./schemas/wip", { recursive: true });

  console.log(
    `Finalized schema version ${version} and in \`${newSchemaDir}\` and deleted the WIP schema.`,
  );
}

await main();
