import { fs, path } from "./fsUtils.mjs";

import * as dotenv from "dotenv"; // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
// Config dotenv in order to read .env file.
dotenv.config();

export const registrationSecrets = {
  registrationSecrets: process.env.registration_secrets.split("|"),
};
export const environment = process.env.environment || "dev";
export const serverPort = process.env.server_port || 8080;
export const privateKey = process.env.private_key
  ? fs.readFileSync(path.resolve(process.env.private_key))
  : "";
export const certificate = process.env.certificate
  ? fs.readFileSync(path.resolve(process.env.certificate))
  : "";
