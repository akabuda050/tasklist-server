import fs from "fs";
if (!fs.existsSync("database")) {
  fs.mkdirSync("database");
}

if (!fs.existsSync("database/users")) {
  fs.mkdirSync("database/users");
}
