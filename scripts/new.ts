import fs from "node:fs/promises";
import { getLatestSchemaVersion } from "../src/script-utils";

async function main() {
	const latestSchemaVersion = getLatestSchemaVersion();
	if (latestSchemaVersion === null) {
		console.error("No existing schemas found to copy from. Oops, I guess.");
		process.exit(1);
	}

	if (latestSchemaVersion.type === "wip") {
		console.error(
			"There's already a WIP schema. Please finalize it with `bun finalize` before creating a new one.",
		);
		process.exit(1);
	}

	const oldSchemaDir = `./schemas/${latestSchemaVersion.dirName}`;
	const newSchemaDir = "./schemas/wip";

	await fs.mkdir(newSchemaDir);

	// Copy every from the old schema dir to the new one
	for (const file of await fs.readdir(oldSchemaDir)) {
		await fs.copyFile(`${oldSchemaDir}/${file}`, `${newSchemaDir}/${file}`);
	}

	console.log(
		`Created new schema at \`${newSchemaDir}\` based on schema ${latestSchemaVersion.dirName}`,
	);
}

await main();
