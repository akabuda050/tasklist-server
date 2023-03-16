import fs from "fs";
if (!fs.existsSync("database")) {
  fs.mkdirSync("database");
  fs.writeFileSync(
    "database/clients.json",
    JSON.stringify({
      count: 0,
    })
  );
}
