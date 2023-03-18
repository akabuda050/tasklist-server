import * as filesystem from "fs";
import * as pathUtils from "path";
import { fileURLToPath } from "url";

// Node.js does not have __filename or __dirname by default.
export const __filename = fileURLToPath(import.meta.url);
export const __dirname = pathUtils.dirname(__filename);
export const fs = filesystem;
export const path = pathUtils;
