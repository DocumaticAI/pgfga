import { resultifyAsync } from "@arda/utils";
import { type FgaSchema, fgaJsonSchema } from "./parsing";

export async function validateSchema(path: string): Promise<boolean> {
	const result = await Bun.$`fga model validate --file ${path}`
		.quiet()
		.nothrow();
	if (result.exitCode !== 0) {
		return false;
	}
	try {
		const json = JSON.parse(result.stdout.toString("utf8")) as {
			is_valid: boolean;
		};
		return json.is_valid;
	} catch {
		return false;
	}
}

export async function getSchemaFromFile(
	path: string,
): Promise<FgaSchema> {
		const json: unknown =
			await Bun.$`fga model transform --file ${path}`.json();
		return fgaJsonSchema.parse(json);
	});
}
