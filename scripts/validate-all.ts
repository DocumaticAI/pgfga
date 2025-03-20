import * as path from "node:path";
import { validateSchema } from "../src/fga-cli";
import { getAllSchemaDirs } from "../src/script-utils";

async function main() {
	console.log("Validating all FGA schemas");
	const schemas = getAllSchemaDirs().map((dirPath) =>
		path.join(dirPath, "schema.fga"),
	);
	if (schemas.length === 0) {
		throw new Error("No schemas found");
	}

	const results = await Promise.all(
		schemas.map(async (path) => ({
			path,
			valid: await validateSchema(path),
		})),
	);

	let success = true;
	for (const result of results) {
		if (!result.valid) {
			console.error(`Schema ${result.path} is invalid`);
			success = false;
		}
	}

	if (!success) {
		process.exit(1);
	}

	console.log("All schemas are valid");
}

await main();
