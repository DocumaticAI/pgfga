import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import prexit from "prexit";

export function getDb() {
	const client = postgres(
		process.env.POSTGRES_DB_DIRECT_URL ??
			process.env.POSTGRES_DB_POOLER_URL ??
			"",
	);
	prexit(async () => {
		await client.end();
	});
	return drizzle(client);
}

export function getAllSchemaDirs(): string[] {
	const glob = new Bun.Glob("./schemas/*");
	return [...glob.scanSync({ cwd: ".", onlyFiles: false })]
		.filter((path) => !path.includes("README"))
		.toSorted();
}

/**
 * Must be fun from the `rebac` dir
 */
export function getLatestSchemaDir(filterWip = false): string | null {
	let versions = getAllSchemaDirs();

	if (versions.length === 0) {
		return null;
	}

	if (versions.includes("./schemas/wip") && !filterWip) {
		return "./schemas/wip";
	}

	versions = versions.filter((path) => !path.includes("wip"));

	return versions[versions.length - 1] ?? null;
}

type LatestSchemaVersion =
	| { type: "numeric"; dirName: string; number: number }
	| { type: "wip" }
	| null;

export function getLatestSchemaVersion(filterWip = false): LatestSchemaVersion {
	const latestSchemaDir = getLatestSchemaDir(filterWip);
	if (latestSchemaDir === null) {
		return null;
	}

	if (latestSchemaDir === "./schemas/wip" && !filterWip) {
		return { type: "wip" };
	}

	const split = latestSchemaDir.split("/");
	const version = split[split.length - 1];
	if (!version) {
		return null;
	}

	return {
		type: "numeric",
		dirName: version,
		number: Number.parseInt(version.replace("v", "")),
	};
}
